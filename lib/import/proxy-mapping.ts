import { normalizeHeader, type ParsedSheet } from "./table";

export type ProxyFieldId = "grantor_ref" | "holder_ref" | "holder_name" | "holder_email" | "type";

export const PROXY_FIELDS: { id: ProxyFieldId; label: string; hint?: string; synonyms: string[] }[] = [
  {
    id: "grantor_ref",
    label: "Référence du mandant",
    hint: "Obligatoire",
    synonyms: [
      "mandant",
      "ref mandant",
      "reference mandant",
      "n mandant",
      "numero mandant",
      "lot mandant",
      "associe mandant",
      "adherent mandant",
      "reference",
      "ref",
    ],
  },
  {
    id: "holder_ref",
    label: "Référence du mandataire (s'il est membre)",
    synonyms: [
      "ref mandataire",
      "reference mandataire",
      "n mandataire",
      "numero mandataire",
      "lot mandataire",
    ],
  },
  {
    id: "holder_name",
    label: "Nom du mandataire (s'il n'est pas membre)",
    synonyms: ["mandataire", "nom mandataire", "mandataire nom", "nom du mandataire"],
  },
  {
    id: "holder_email",
    label: "E-mail du mandataire",
    synonyms: ["email mandataire", "e mail mandataire", "mail mandataire", "courriel mandataire"],
  },
  {
    id: "type",
    label: "Type (nominatif / en blanc)",
    synonyms: ["type", "type de pouvoir", "nature", "blanc"],
  },
];

export type ProxyMapping = Partial<Record<ProxyFieldId, number | null>>;

export function guessProxyMapping(headers: string[]): ProxyMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ProxyMapping = {};
  for (const field of PROXY_FIELDS) {
    const index = normalized.findIndex((h, i) => !used.has(i) && field.synonyms.includes(h));
    mapping[field.id] = index === -1 ? null : index;
    if (index !== -1) used.add(index);
  }
  return mapping;
}

// « blanc », « en blanc », « B » → blank ; vide ou « nominatif » → named ; sinon la valeur
// brute, que la base refusera (type invalide).
export function normalizeProxyType(raw: string): string {
  const value = normalizeHeader(raw);
  if (["blanc", "en blanc", "b", "blank", "oui", "x"].includes(value)) return "blank";
  if (["", "nominatif", "nominative", "n", "named", "non"].includes(value)) return "named";
  return raw;
}

export type ProxyImportRow = {
  line: number;
  grantor_ref: string;
  holder_ref?: string;
  holder_name?: string;
  holder_email?: string;
  type: string;
};

export function buildProxyRows(sheet: ParsedSheet, mapping: ProxyMapping): ProxyImportRow[] {
  const cell = (cells: string[], field: ProxyFieldId) => {
    const index = mapping[field];
    return index === null || index === undefined ? "" : (cells[index] ?? "").trim();
  };
  return sheet.rows.map(({ line, cells }) => {
    const row: ProxyImportRow = {
      line,
      grantor_ref: cell(cells, "grantor_ref"),
      type: normalizeProxyType(cell(cells, "type")),
    };
    for (const field of ["holder_ref", "holder_name", "holder_email"] as const) {
      const value = cell(cells, field);
      if (value) row[field] = value;
    }
    return row;
  });
}
