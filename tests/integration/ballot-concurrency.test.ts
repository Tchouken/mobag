import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db";

// Votes concurrents (SPEC §5.8, §7.1) : réessais simultanés de la même requête, double vote
// interdit sous concurrence, clôture au milieu d'un flux de votes. Données commitées ; chaque
// exécution crée sa propre organisation.

const VOTERS = 20;

let admin: Client;
let pool: Client[] = [];
let staff: string;
let assembly: string;
const resolutions: string[] = [];
const voters: { device: string; member: string }[] = [];

async function as<T>(client: Client, uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return rows[0] as T;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function cast(client: Client, voter: number, ballot: string, choice: string, key = randomUUID()) {
  const v = voters[voter]!;
  try {
    const row = await as<{ r: { status: string } }>(
      client,
      v.device,
      "select public.cast_votes($1, $2, $3) as r",
      [ballot, JSON.stringify([{ member_id: v.member, choice }]), key],
    );
    return { ok: true as const, response: row.r, key };
  } catch (error) {
    return { ok: false as const, code: (error as { message: string }).message, key };
  }
}

const openBallot = async (resolution: string) =>
  (await as<{ r: { ballot_id: string } }>(admin, staff, "select public.open_ballot($1) as r", [resolution])).r
    .ballot_id;

beforeAll(async () => {
  admin = await connect();
  pool = await Promise.all(Array.from({ length: VOTERS }, () => connect()));
  staff = randomUUID();
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [staff, `${staff}@scrutin.test`]);
  const {
    rows: [org],
  } = await admin.query<{ id: string }>(
    "insert into public.organizations (name, slug) values ('Scrutin', $1) returning id",
    [`scrutin-${staff.slice(0, 8)}`],
  );
  await admin.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'organizer')", [
    org!.id,
    staff,
  ]);
  ({ id: assembly } = await as<{ id: string }>(
    admin,
    staff,
    "select public.create_assembly($1, 'AG', 'ago', 'association', '', '2026-06-01 10:00') as id",
    [org!.id],
  ));
  const rows = Array.from({ length: VOTERS }, (_, i) => ({
    external_ref: `M${i + 1}`,
    last_name: `Membre ${i + 1}`,
    weights: { voix: 1 },
  }));
  await as(admin, staff, "select public.import_members($1, $2, 'append', false)", [
    assembly,
    JSON.stringify(rows),
  ]);
  const { rows: key } = await admin.query<{ id: string }>(
    "select id from public.weight_keys where assembly_id = $1 and is_primary",
    [assembly],
  );
  const rule = {
    conditions: [
      { measure: "weight", numerator: "for", base: "expressed", num: 1, den: 2, comparison: "gt" },
    ],
  };
  for (const allowChange of [true, false, true]) {
    const { id } = await as<{ id: string }>(
      admin,
      staff,
      "select public.upsert_resolution($1, null, $2) as id",
      [
        assembly,
        JSON.stringify({
          title: `Résolution ${resolutions.length + 1}`,
          body: { type: "doc", content: [] },
          weight_key_id: key[0]!.id,
          vote_type: "yes_no_abstain",
          majority_rule: rule,
          abstention_policy: "excluded",
          quorum_rule: null,
          is_secret: false,
          allow_vote_change: allowChange,
        }),
      ],
    );
    resolutions.push(id);
  }
  await admin.query(
    "insert into public.assembly_staff (assembly_id, user_id, role) values ($1, $2, 'president')",
    [assembly, staff],
  );
  await as(admin, staff, "select public.set_assembly_status($1, 'convened', null)", [assembly]);

  // Une personne et un appareil (session anonyme) par membre.
  const { rows: members } = await admin.query<{ id: string }>(
    "select id from public.members where assembly_id = $1 order by external_ref",
    [assembly],
  );
  for (const member of members) {
    const device = randomUUID();
    await admin.query("insert into auth.users (id, is_anonymous) values ($1, true)", [device]);
    const { id: attendee } = await as<{ id: string }>(
      admin,
      staff,
      "select public.upsert_attendee($1, null, 'Votant', null, null, $2, false) as id",
      [assembly, [member.id]],
    );
    await as(admin, staff, "select public.check_in($1, $2)", [assembly, attendee]);
    const { r } = await as<{ r: { code: string } }>(
      admin,
      staff,
      "select public.issue_voter_token($1, 'personal') as r",
      [attendee],
    );
    await as(admin, device, "select public.claim_voter_token($1)", [r.code]);
    voters.push({ device, member: member.id });
  }
  await as(admin, staff, "select public.set_assembly_status($1, 'in_session', null)", [assembly]);
}, 60_000);

afterAll(async () => {
  await Promise.all([admin.end(), ...pool.map((c) => c.end())]);
});

describe("votes concurrents", () => {
  it("dix réessais simultanés de la même requête n'écrivent qu'un vote", async () => {
    const ballot = await openBallot(resolutions[0]!);
    const key = randomUUID();
    const results = await Promise.all(pool.slice(0, 10).map((client) => cast(client, 0, ballot, "for", key)));

    expect(results.every((r) => r.ok)).toBe(true);
    const responses = new Set(results.map((r) => (r.ok ? JSON.stringify(r.response) : "")));
    expect(responses.size).toBe(1);
    const { rows } = await admin.query(
      "select count(*)::int as n from public.vote_events where ballot_id = $1",
      [ballot],
    );
    expect(rows[0].n).toBe(1);
    await as(admin, staff, "select public.close_ballot($1)", [ballot]);
  });

  it("deux envois simultanés pour le même membre, vote non modifiable : un seul aboutit", async () => {
    const ballot = await openBallot(resolutions[1]!);
    const results = await Promise.all(
      pool.slice(0, 8).map((client, i) => cast(client, 1, ballot, i % 2 ? "for" : "against")),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(new Set(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.code)))).toEqual(
      new Set(["vote_already_cast"]),
    );
    const { rows } = await admin.query(
      "select count(*)::int as n, max(revision) as rev from public.votes where ballot_id = $1",
      [ballot],
    );
    expect(rows[0]).toEqual({ n: 1, rev: 1 });
    await as(admin, staff, "select public.close_ballot($1)", [ballot]);
  });

  it("clôture au milieu d'un flux de votes : rien n'est accepté après, tout ce qui est accepté est compté", async () => {
    const ballot = await openBallot(resolutions[2]!);
    let closing = false;
    const outcomes = await Promise.all([
      ...pool.map(async (client, voter) => {
        const mine = [];
        for (let i = 0; i < 15; i++) {
          mine.push(await cast(client, voter, ballot, i % 3 === 0 ? "against" : "for"));
          if (closing && !mine.at(-1)!.ok) break;
        }
        return mine;
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 150));
        closing = true;
        await as(admin, staff, "select public.close_ballot($1)", [ballot]);
        return [];
      })(),
    ]);
    const all = outcomes.flat();
    const accepted = all.filter((r) => r.ok);
    const refused = all.filter((r) => !r.ok);

    expect(accepted.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
    expect(new Set(refused.map((r) => (r.ok ? "" : r.code)))).toEqual(new Set(["ballot_not_open"]));

    const { rows: late } = await admin.query(
      `select count(*)::int as n from public.vote_events e join public.ballots b on b.id = e.ballot_id
       where b.id = $1 and e.at > b.closed_at`,
      [ballot],
    );
    expect(late[0].n).toBe(0);
    const { rows: events } = await admin.query(
      "select count(*)::int as n from public.vote_events where ballot_id = $1",
      [ballot],
    );
    expect(events[0].n).toBe(accepted.length);
    const { rows: keys } = await admin.query<{ k: string }>(
      "select idempotency_key::text as k from public.vote_events where ballot_id = $1",
      [ballot],
    );
    expect(new Set(keys.map((r) => r.k))).toEqual(new Set(accepted.map((r) => r.key)));

    const { rows: result } = await admin.query(
      "select (tallies -> 'voted' ->> 'heads')::int as voted from public.results where ballot_id = $1",
      [ballot],
    );
    const { rows: distinctVoters } = await admin.query(
      "select count(*)::int as n from public.votes where ballot_id = $1",
      [ballot],
    );
    expect(result[0].voted).toBe(distinctVoters[0].n);
    const { rows: chain } = await admin.query("select private.verify_audit_chain_unchecked($1) as v", [
      assembly,
    ]);
    expect(chain[0].v).toMatchObject({ ok: true, ballots: 3 });
  });
});
