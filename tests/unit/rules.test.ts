import { describe, expect, it } from "vitest";
import fixtures from "@/tests/fixtures/rules.json";
import {
  describeRule,
  majorityRuleSchema,
  proxyRulesSchema,
  quorumRuleSchema,
  settingsSchema,
} from "@/lib/domain/rules";

const schemas = {
  majority: majorityRuleSchema,
  quorum: quorumRuleSchema,
  proxy: proxyRulesSchema,
  settings: settingsSchema,
} as const;

describe.each(Object.entries(schemas))("schéma %s", (kind, schema) => {
  const cases = fixtures[kind as keyof typeof fixtures];

  it.each(cases.valid.map((c, i) => [i, c]))("cas valide n°%i accepté", (_i, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each(cases.invalid.map((c, i) => [i, c]))("cas invalide n°%i refusé", (_i, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe("describeRule", () => {
  it("décrit une double majorité", () => {
    expect(describeRule(majorityRuleSchema.parse(fixtures.majority.valid[1]))).toBe(
      "« pour » en nombre de membres : plus de la moitié de tous les membres ET « pour » en voix : au moins 2/3 de tous les membres",
    );
  });

  it("signale l'absence de quorum", () => {
    expect(describeRule({ conditions: [] })).toBe("Aucune condition");
  });
});
