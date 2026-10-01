import { z } from "zod";

// Miroir exact de private.validate_rule / validate_proxy_rules / validate_settings
// (supabase/migrations/20261001000005_assemblies.sql). La parité est vérifiée par
// tests/integration/rules-parity.test.ts sur le jeu de cas tests/fixtures/rules.json.

const bounded = z.number().int().min(1).max(1000);

export const fractionSchema = z
  .object({ num: bounded, den: bounded })
  .strict()
  .refine((f) => f.num <= f.den, "Le numérateur doit être inférieur ou égal au dénominateur.");

const conditionShape = {
  measure: z.enum(["weight", "heads"]),
  num: bounded,
  den: bounded,
  comparison: z.enum(["gt", "gte"]),
};

const majorityConditionSchema = z
  .object({
    ...conditionShape,
    numerator: z.literal("for"),
    base: z.enum(["expressed", "present_represented", "all_members"]),
  })
  .strict()
  .refine((c) => c.num <= c.den, "Seuil invalide.");

const quorumConditionSchema = z
  .object({
    ...conditionShape,
    numerator: z.literal("present_represented"),
    base: z.literal("all_members"),
  })
  .strict()
  .refine((c) => c.num <= c.den, "Seuil invalide.");

const preset = z.string().max(64).optional();

export const majorityRuleSchema = z
  .object({ conditions: z.array(majorityConditionSchema).min(1).max(4), preset })
  .strict();

export const quorumRuleSchema = z
  .object({ conditions: z.array(quorumConditionSchema).max(4), preset })
  .strict();

export const proxyRulesSchema = z
  .object({
    max_count: bounded.nullable(),
    max_share: fractionSchema.nullable(),
    share_key: z.literal("primary"),
    combine: z.enum(["and", "or"]),
    forbid_subdelegation: z.boolean(),
    blank_to: z.enum(["president", "board_recommendation", "none"]),
    allow_transfer_on_departure: z.boolean(),
    preset,
  })
  .strict();

export const settingsSchema = z
  .object({
    allow_vote_change: z.boolean(),
    departure_during_ballot: z.enum(["transfer_unvoted", "freeze"]),
    hide_live_trend: z.boolean(),
    single_open_ballot: z.boolean(),
  })
  .strict();

export type MajorityRule = z.infer<typeof majorityRuleSchema>;
export type QuorumRule = z.infer<typeof quorumRuleSchema>;
export type RuleCondition = MajorityRule["conditions"][number] | QuorumRule["conditions"][number];
export type ProxyRules = z.infer<typeof proxyRulesSchema>;
export type AssemblySettings = z.infer<typeof settingsSchema>;

// ===== Libellés =====
const BASE_LABELS: Record<RuleCondition["base"], string> = {
  expressed: "des voix exprimées",
  present_represented: "des présents et représentés",
  all_members: "de tous les membres",
};

function fraction(num: number, den: number): string {
  if (num === den) return "la totalité";
  if (num === 1 && den === 2) return "la moitié";
  return `${num}/${den}`;
}

// Phrase française décrivant une condition, ex. « voix : plus de la moitié des voix exprimées ».
export function describeCondition(c: RuleCondition): string {
  const measure = c.measure === "weight" ? "en voix" : "en nombre de membres";
  const comparison = c.comparison === "gt" ? "plus de" : "au moins";
  const subject = c.numerator === "for" ? "« pour »" : "présents ou représentés";
  return `${subject} ${measure} : ${comparison} ${fraction(c.num, c.den)} ${BASE_LABELS[c.base]}`;
}

export function describeRule(rule: { conditions: RuleCondition[] } | null): string {
  if (!rule || rule.conditions.length === 0) return "Aucune condition";
  return rule.conditions.map(describeCondition).join(" ET ");
}
