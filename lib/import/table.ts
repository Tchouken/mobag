// Types et utilitaires purs (navigateur et serveur) de l'import de participants.

export type ParsedSheet = {
  sheetName: string | null;
  headers: string[];
  rows: { line: number; cells: string[] }[];
};

// UTF-8 strict, sinon Windows-1252 (CSV enregistrés par Excel en France). BOM retiré.
export function decodeText(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^﻿/, "");
}

// Nombre saisi « à la française » → décimal à point. Une valeur non reconnue est
// renvoyée telle quelle : la base la signalera comme voix invalide.
//   "1 234,5" → "1234.5" · "1.234,5" → "1234.5" · "1,234.5" → "1234.5" · "12,5" → "12.5"
export function normalizeNumber(raw: string): string {
  const value = raw.replace(/[\s  ]/g, "");
  if (value === "") return "";
  if (/^-?\d+(,\d+)?$/.test(value)) return value.replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) return value.replace(/\./g, "").replace(",", ".");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) return value.replace(/,/g, "");
  return raw.trim();
}

const TRUE_VALUES = new Set(["oui", "o", "x", "1", "true", "vrai", "yes", "y"]);
const FALSE_VALUES = new Set(["non", "n", "0", "false", "faux", "no", ""]);

// Booléen tolérant ; une valeur non reconnue est renvoyée telle quelle (refusée en base).
export function normalizeBoolean(raw: string): boolean | string {
  const value = normalizeHeader(raw);
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return raw;
}

export function normalizeKind(raw: string): string | null {
  const value = normalizeHeader(raw);
  if (value === "") return null;
  if (
    ["pm", "morale", "personne morale", "societe", "entreprise", "legal_entity", "legal entity"].includes(
      value,
    )
  ) {
    return "legal_entity";
  }
  if (["pp", "physique", "personne physique", "particulier", "person"].includes(value)) return "person";
  return raw;
}

// En-tête comparable : minuscules, sans accents ni ponctuation superflue.
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[°º#.:_\-/()'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
