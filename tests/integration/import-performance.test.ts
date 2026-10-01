import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "./db";

// L'import doit rester fluide au maximum autorisé (20 000 lignes), y compris la
// détection des doublons : une implémentation quadratique prendrait des minutes.
const ROWS = 20000;
const BUDGET_MS = 15000;

let db: Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

describe("import_members à 20 000 lignes", () => {
  it("valide puis importe dans le budget, dans une transaction annulée", async () => {
    await db.query("begin");
    try {
      const user = "00000000-0000-0000-0000-000000000f0f";
      await db.query("insert into auth.users (id, email) values ($1, 'perf@org.test')", [user]);
      const {
        rows: [org],
      } = await db.query<{ id: string }>(
        "insert into public.organizations (name, slug) values ('Perf', 'perf-import') returning id",
      );
      await db.query("insert into public.org_members (org_id, user_id, role) values ($1, $2, 'organizer')", [
        org!.id,
        user,
      ]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user, role: "authenticated" }),
      ]);
      await db.query("set local role authenticated");
      const {
        rows: [{ id: assembly }],
      } = await db.query<{ id: string }>(
        "select public.create_assembly($1, 'Grande AG', 'ago', 'association', '', '2026-06-01 10:00') as id",
        [org!.id],
      );

      const rows = Array.from({ length: ROWS }, (_, i) => ({
        line: i + 2,
        last_name: `Adhérent${i}`,
        first_name: "Test",
        external_ref: `R${i}`,
        email: `adherent${i}@exemple.fr`,
        weights: { voix: 1 },
      }));

      const started = Date.now();
      const { rows: dry } = await db.query<{ report: { ok: boolean; rows: number } }>(
        "select public.import_members($1, $2::jsonb, 'append', true) as report",
        [assembly, JSON.stringify(rows)],
      );
      const { rows: real } = await db.query<{ report: { ok: boolean; inserted: number } }>(
        "select public.import_members($1, $2::jsonb, 'append', false) as report",
        [assembly, JSON.stringify(rows)],
      );
      const elapsed = Date.now() - started;
      console.info(`import 2 × ${ROWS} lignes (à blanc + réel) : ${elapsed} ms`);

      expect(dry[0]!.report.ok).toBe(true);
      expect(real[0]!.report.inserted).toBe(ROWS);
      expect(elapsed).toBeLessThan(BUDGET_MS);
    } finally {
      await db.query("rollback");
    }
  }, 120000);
});
