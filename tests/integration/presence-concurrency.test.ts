import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db";

// Deux postes d'accueil qui agissent au même instant (SPEC §5.5) : les mouvements d'une AG
// sont sérialisés par un verrou consultatif. Les données sont commitées (plusieurs
// connexions) ; chaque exécution crée sa propre organisation.

let admin: Client;
let posteA: Client;
let posteB: Client;
let user: string;
let assembly: string;
const members: Record<string, string> = {};
const attendees: Record<string, string> = {};

async function asUser<T>(client: Client, sql: string, params: unknown[] = []): Promise<T> {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: user, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
  const { rows } = await client.query(sql, params);
  return rows[0] as T;
}

// Exécute sql dans une transaction ouverte ; renvoie le code d'erreur métier éventuel.
async function attempt(client: Client, sql: string, params: unknown[]): Promise<string | null> {
  try {
    await asUser(client, sql, params);
    return null;
  } catch (error) {
    return (error as { message: string }).message;
  }
}

beforeAll(async () => {
  [admin, posteA, posteB] = await Promise.all([connect(), connect(), connect()]);
  user = randomUUID();
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [user, `${user}@concurrence.test`]);
  const {
    rows: [org],
  } = await admin.query<{ id: string }>(
    "insert into public.organizations (name, slug) values ('Concurrence', $1) returning id",
    [`concurrence-${user.slice(0, 8)}`],
  );
  await admin.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'organizer')", [
    org!.id,
    user,
  ]);

  await admin.query("begin");
  ({ id: assembly } = await asUser<{ id: string }>(
    admin,
    "select public.create_assembly($1, 'AG', 'ago', 'association', '', '2026-06-01 10:00') as id",
    [org!.id],
  ));
  await admin.query(
    `select public.import_members($1, '[
      {"external_ref": "M1", "last_name": "Un", "weights": {"voix": 1}},
      {"external_ref": "M2", "last_name": "Deux", "weights": {"voix": 1}},
      {"external_ref": "M3", "last_name": "Trois", "weights": {"voix": 1}},
      {"external_ref": "M4", "last_name": "Quatre", "weights": {"voix": 1}}
    ]', 'append', false)`,
    [assembly],
  );
  // Un seul pouvoir par mandataire.
  await admin.query(
    `select public.update_assembly_rules($1, 1, null,
      '{"max_count": 1, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
      '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}')`,
    [assembly],
  );
  const { rows } = await admin.query<{ id: string; external_ref: string }>(
    "select id, external_ref from public.members where assembly_id = $1",
    [assembly],
  );
  for (const row of rows) members[row.external_ref] = row.id;
  for (const name of ["Un", "Mandataire"]) {
    const {
      rows: [a],
    } = await admin.query<{ id: string }>(
      "select public.upsert_attendee($1, null, $2, null, null, $3, false) as id",
      [assembly, name, name === "Un" ? [members.M1] : []],
    );
    attendees[name] = a!.id;
  }
  await admin.query("select public.set_assembly_status($1, 'convened', null)", [assembly]);
  await admin.query("commit");
});

afterAll(async () => {
  await Promise.all([admin.end(), posteA.end(), posteB.end()]);
});

describe("deux postes d'accueil simultanés", () => {
  it("un seul émargement de la même personne aboutit", async () => {
    await Promise.all([posteA.query("begin"), posteB.query("begin")]);
    const first = await attempt(posteA, "select public.check_in($1, $2, null, null, 1)", [
      assembly,
      attendees.Un,
    ]);
    // Le poste B attend le verrou de l'AG tant que A n'a pas validé.
    const secondPromise = attempt(posteB, "select public.check_in($1, $2, null, null, 1)", [
      assembly,
      attendees.Un,
    ]);
    await new Promise((r) => setTimeout(r, 200));
    await posteA.query("commit");
    const second = await secondPromise;
    await posteB.query("rollback");

    expect(first).toBeNull();
    expect(second).toBe("version_conflict");
  });

  it("deux pouvoirs simultanés vers le même mandataire ne dépassent pas le plafond", async () => {
    await Promise.all([posteA.query("begin"), posteB.query("begin")]);
    const sql = "select public.grant_proxy($1, $2, $3, 'named')";
    const first = await attempt(posteA, sql, [assembly, members.M2, attendees.Mandataire]);
    const secondPromise = attempt(posteB, sql, [assembly, members.M3, attendees.Mandataire]);
    await new Promise((r) => setTimeout(r, 200));
    await posteA.query("commit");
    const second = await secondPromise;
    await posteB.query("rollback");

    expect(first).toBeNull();
    expect(second).toBe("proxy_rule_violation");
    const { rows } = await admin.query(
      "select count(*)::int as n from public.proxies where holder_attendee_id = $1 and status = 'active'",
      [attendees.Mandataire],
    );
    expect(rows[0].n).toBe(1);
  });

  it("deux pouvoirs simultanés du même mandant : un seul est enregistré", async () => {
    await admin.query("begin");
    const other = await asUser<{ id: string }>(
      admin,
      "select public.upsert_attendee($1, null, 'Autre mandataire', null, null, null, false) as id",
      [assembly],
    );
    await admin.query("commit");
    await Promise.all([posteA.query("begin"), posteB.query("begin")]);
    const sql = "select public.grant_proxy($1, $2, $3, 'named')";
    const first = await attempt(posteA, sql, [assembly, members.M4, other!.id]);
    const secondPromise = attempt(posteB, sql, [assembly, members.M4, other!.id]);
    await new Promise((r) => setTimeout(r, 200));
    await posteA.query("commit");
    const second = await secondPromise;
    await posteB.query("rollback");

    expect(first).toBeNull();
    expect(second).toBe("proxy_exists");
  });
});
