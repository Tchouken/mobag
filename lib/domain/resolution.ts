import { z } from "zod";
import { majorityRuleSchema, quorumRuleSchema } from "./rules";

// Données d'une résolution envoyées à upsert_resolution (validées aussi en base).
export const resolutionSchema = z
  .object({
    parent_id: z.uuid().nullable(),
    title: z.string().trim().min(1, "Le titre est obligatoire.").max(300, "300 caractères maximum."),
    body: z.object({ type: z.literal("doc") }).passthrough(),
    weight_key_id: z.uuid("Choisissez une clé de répartition."),
    vote_type: z.enum(["yes_no_abstain", "information"]),
    majority_rule: majorityRuleSchema.nullable(),
    abstention_policy: z.enum(["excluded", "included"]),
    quorum_rule: quorumRuleSchema.nullable(),
    is_secret: z.boolean(),
    allow_vote_change: z.boolean().nullable(),
    board_recommendation: z.enum(["for", "against"]).nullable(),
  })
  .refine((r) => r.vote_type === "information" || r.majority_rule !== null, {
    message: "Choisissez une règle de majorité.",
    path: ["majority_rule"],
  });

export type ResolutionInput = z.infer<typeof resolutionSchema>;

export const VOTE_TYPE_LABELS = {
  yes_no_abstain: "Pour / Contre / Abstention",
  multiple_choice: "Choix multiple",
  election: "Élection",
  information: "Information (sans vote)",
} as const;

export const ABSTENTION_LABELS = {
  excluded: "Non comptées : seuls « pour » et « contre » sont des voix exprimées",
  included: "Comptées dans les voix exprimées",
} as const;

// Champs comparés d'une version à l'autre dans l'historique.
export const VERSIONED_FIELDS: { key: string; label: string }[] = [
  { key: "title", label: "Titre" },
  { key: "body", label: "Texte" },
  { key: "parent_id", label: "Rattachement" },
  { key: "weight_key_id", label: "Clé de répartition" },
  { key: "vote_type", label: "Type de vote" },
  { key: "majority_rule", label: "Majorité" },
  { key: "abstention_policy", label: "Abstentions" },
  { key: "quorum_rule", label: "Quorum" },
  { key: "is_secret", label: "Vote secret" },
  { key: "allow_vote_change", label: "Modification du vote" },
  { key: "board_recommendation", label: "Avis du conseil" },
];

export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): string[] {
  if (!before) return [];
  return VERSIONED_FIELDS.filter(
    (f) => JSON.stringify(before[f.key] ?? null) !== JSON.stringify(after[f.key] ?? null),
  ).map((f) => f.label);
}
