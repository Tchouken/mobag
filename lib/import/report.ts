import { FIELDS } from "./mapping";

export type ReportIssue = {
  line: number | null;
  field: string | null;
  code: string;
  value?: unknown;
  declared?: number;
  projected?: number;
  difference?: number;
};

export type ImportReport = {
  ok: boolean;
  dry_run: boolean;
  mode: "append" | "upsert" | "replace";
  rows: number;
  inserted: number;
  updated: number;
  error_count: number;
  errors: ReportIssue[];
  warning_count: number;
  warnings: ReportIssue[];
  totals: {
    code: string;
    label: string;
    declared: number | null;
    projected: number;
    members_with_weight: number;
  }[];
};

export const ISSUE_MESSAGES: Record<string, string> = {
  missing_name: "Aucun nom : renseignez un nom, une raison sociale ou un nom complet.",
  invalid_kind: "Nature inconnue (attendu : personne physique ou personne morale).",
  invalid_email: "Adresse e-mail invalide.",
  invalid_weight: "Nombre de voix illisible.",
  negative_weight: "Nombre de voix négatif.",
  unknown_weight_key: "Clé de répartition inconnue.",
  field_too_long: "Valeur trop longue.",
  invalid_boolean: "Valeur oui/non illisible.",
  duplicate_ref: "Référence présente plusieurs fois dans le fichier.",
  ref_exists: "Référence déjà présente dans l'assemblée (choisissez le mode « mise à jour »).",
  invalid_row: "Ligne illisible.",
  no_voting_rights: "Membre sans aucune voix.",
  duplicate_email: "Adresse e-mail partagée avec d'autres lignes.",
  total_mismatch: "Le total des voix diffère du total déclaré.",
};

export function issueMessage(code: string): string {
  return ISSUE_MESSAGES[code] ?? code;
}

export function fieldLabel(field: string | null, keyLabels: Record<string, string>): string {
  if (!field) return "—";
  if (field.startsWith("weights.")) {
    const code = field.slice("weights.".length);
    return keyLabels[code] ?? code;
  }
  if (field === "weights") return "Voix";
  return FIELDS.find((f) => f.id === field)?.label ?? field;
}

export const IMPORT_MODES: Record<ImportReport["mode"], { label: string; hint: string }> = {
  append: { label: "Ajouter", hint: "Ajoute les lignes du fichier ; une référence déjà connue est refusée." },
  upsert: {
    label: "Mettre à jour",
    hint: "Met à jour les membres de même référence et ajoute les autres. Les membres absents du fichier sont conservés.",
  },
  replace: { label: "Remplacer", hint: "Supprime tous les membres de l'assemblée et importe le fichier." },
};
