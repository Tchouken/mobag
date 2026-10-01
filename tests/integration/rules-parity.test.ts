import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixtures from "@/tests/fixtures/rules.json";
import { majorityRuleSchema, proxyRulesSchema, quorumRuleSchema, settingsSchema } from "@/lib/domain/rules";
import { connect } from "./db";

// Zod (navigateur, serveur) et SQL (contraintes CHECK, RPC) doivent accepter et refuser
// exactement les mêmes règles : une divergence laisserait passer côté client une règle
// que la base refuse, ou pire, l'inverse.
const validators = {
  majority: { schema: majorityRuleSchema, sql: "select private.validate_rule($1::jsonb, 'majority') as ok" },
  quorum: { schema: quorumRuleSchema, sql: "select private.validate_rule($1::jsonb, 'quorum') as ok" },
  proxy: { schema: proxyRulesSchema, sql: "select private.validate_proxy_rules($1::jsonb) as ok" },
  settings: { schema: settingsSchema, sql: "select private.validate_settings($1::jsonb) as ok" },
} as const;

let db: Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

describe.each(Object.entries(validators))("parité Zod/SQL — %s", (kind, { schema, sql }) => {
  const cases = fixtures[kind as keyof typeof fixtures];
  const all = [
    ...cases.valid.map((value) => ({ value, expected: true })),
    ...cases.invalid.map((value) => ({ value, expected: false })),
  ];

  it.each(all.map((c, i) => [i, c]))("cas n°%i", async (_i, { value, expected }) => {
    const { rows } = await db.query<{ ok: boolean | null }>(sql, [JSON.stringify(value)]);
    // Le SQL doit répondre true/false, jamais NULL (une contrainte CHECK laisserait passer NULL).
    expect(rows[0]?.ok).toBe(expected);
    expect(schema.safeParse(value).success).toBe(expected);
  });
});

describe("presets en base", () => {
  it("chaque preset est valide pour Zod", async () => {
    const { rows } = await db.query<{ code: string; kind: keyof typeof validators; params: unknown }>(
      "select code, kind, params from public.rule_presets",
    );
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(validators[row.kind].schema.safeParse(row.params).success, row.code).toBe(true);
    }
  });
});
