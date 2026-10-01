import { normalizeBoolean, normalizeHeader, normalizeKind, normalizeNumber, type ParsedSheet } from "./table";

export type FieldId =
  | "kind"
  | "last_name"
  | "first_name"
  | "company_name"
  | "display_name"
  | "external_ref"
  | "email"
  | "phone"
  | "representative_name"
  | "is_proxy_ineligible";

export const FIELDS: { id: FieldId; label: string; hint?: string; synonyms: string[] }[] = [
  {
    id: "external_ref",
    label: "Référence",
    hint: "N° d'associé, de lot ou d'adhérent",
    synonyms: [
      "reference",
      "ref",
      "numero",
      "n",
      "no",
      "num",
      "id",
      "identifiant",
      "code",
      "lot",
      "n lot",
      "numero de lot",
      "n associe",
      "numero associe",
      "n adherent",
      "numero adherent",
      "matricule",
    ],
  },
  {
    id: "last_name",
    label: "Nom",
    synonyms: ["nom", "nom de famille", "last name", "lastname", "nom usage"],
  },
  { id: "first_name", label: "Prénom", synonyms: ["prenom", "first name", "firstname", "prenoms"] },
  {
    id: "company_name",
    label: "Raison sociale",
    synonyms: ["raison sociale", "societe", "denomination", "entreprise", "personne morale", "company"],
  },
  {
    id: "display_name",
    label: "Nom complet",
    hint: "Si le fichier n'a pas de colonnes nom et prénom séparées",
    synonyms: [
      "nom complet",
      "nom prenom",
      "titulaire",
      "associe",
      "adherent",
      "coproprietaire",
      "membre",
      "actionnaire",
      "full name",
    ],
  },
  {
    id: "kind",
    label: "Nature",
    hint: "Personne physique ou morale (déduite si absente)",
    synonyms: ["nature", "type", "type de personne", "personne", "forme"],
  },
  {
    id: "email",
    label: "E-mail",
    synonyms: ["email", "e mail", "mail", "courriel", "adresse mail", "adresse email"],
  },
  {
    id: "phone",
    label: "Téléphone",
    synonyms: ["telephone", "tel", "portable", "mobile", "phone", "numero de telephone"],
  },
  {
    id: "representative_name",
    label: "Représentant",
    synonyms: ["representant", "representant legal", "mandataire social", "representant permanent"],
  },
  {
    id: "is_proxy_ineligible",
    label: "Non éligible mandataire",
    hint: "oui / non",
    synonyms: ["non eligible", "non eligible mandataire", "ineligible", "inelegible mandataire"],
  },
];

export type WeightKeyRef = { code: string; label: string };

// Association champ → index de colonne (null : non importé). Les voix sont indexées
// par code de clé de répartition.
export type Mapping = {
  fields: Partial<Record<FieldId, number | null>>;
  weights: Record<string, number | null>;
};

const WEIGHT_SYNONYMS = [
  "voix",
  "nombre de voix",
  "actions",
  "nombre d actions",
  "parts",
  "parts sociales",
  "tantiemes",
  "droits de vote",
  "votes",
  "poids",
];

// Proposition automatique à partir des en-têtes. Une colonne n'est attribuée qu'une fois.
export function guessMapping(headers: string[], keys: WeightKeyRef[]): Mapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const take = (candidates: string[]): number | null => {
    const index = normalized.findIndex((h, i) => !used.has(i) && candidates.includes(h));
    if (index === -1) return null;
    used.add(index);
    return index;
  };

  const weights: Record<string, number | null> = {};
  // Clés : d'abord par libellé ou code exact, puis la clé principale par synonyme générique.
  for (const key of keys) {
    weights[key.code] = take([normalizeHeader(key.label), normalizeHeader(key.code)]);
  }
  for (const key of keys) {
    if (weights[key.code] === null) weights[key.code] = take(WEIGHT_SYNONYMS);
  }

  const fields: Mapping["fields"] = {};
  for (const field of FIELDS) fields[field.id] = take(field.synonyms);
  return { fields, weights };
}

export type ImportRow = {
  line: number;
  kind?: string | null;
  is_proxy_ineligible?: boolean | string;
  weights: Record<string, string>;
} & Partial<Record<Exclude<FieldId, "kind" | "is_proxy_ineligible">, string>>;

// Lignes envoyées à import_members : textes bruts, nombres et booléens normalisés.
// La validation métier reste en base.
export function buildImportRows(sheet: ParsedSheet, mapping: Mapping): ImportRow[] {
  return sheet.rows.map(({ line, cells }) => {
    const cell = (index: number | null | undefined) =>
      index === null || index === undefined ? "" : (cells[index] ?? "");
    const row: ImportRow = { line, weights: {} };
    for (const field of FIELDS) {
      const index = mapping.fields[field.id];
      if (index === null || index === undefined) continue;
      const raw = cell(index);
      if (field.id === "kind") row.kind = normalizeKind(raw);
      else if (field.id === "is_proxy_ineligible") row.is_proxy_ineligible = normalizeBoolean(raw);
      else row[field.id] = raw;
    }
    for (const [code, index] of Object.entries(mapping.weights)) {
      if (index !== null) row.weights[code] = normalizeNumber(cell(index));
    }
    return row;
  });
}

export function hasNameColumn(mapping: Mapping): boolean {
  const f = mapping.fields;
  return [f.last_name, f.company_name, f.display_name].some((i) => i !== null && i !== undefined);
}
