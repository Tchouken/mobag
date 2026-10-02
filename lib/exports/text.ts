// Outils communs aux exports : texte compatible avec les polices standard des PDF (WinAnsi),
// dates dans le fuseau de l'AG, CSV, noms de fichiers.

const WIN_ANSI_EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

// Les polices standard des PDF n'encodent que WinAnsi : espaces fines et insécables (produites
// par Intl en français) deviennent des espaces, les autres caractères hors jeu un « ? ».
export function winAnsi(text: string): string {
  return Array.from(text.normalize("NFC").replace(/[   ]/g, " ").replace(/ /g, " "))
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.includes(ch))
        return ch;
      if (ch === "\n" || ch === "\t") return " ";
      if (ch === "≥") return ">=";
      if (ch === "≤") return "<=";
      if (ch === "✓") return "v";
      return "?";
    })
    .join("");
}

export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

export function formatLongDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone }).format(
    new Date(iso),
  );
}

// CSV pour tableur français : séparateur « ; », BOM UTF-8, guillemets échappés, et neutralisation
// des formules (une cellule commençant par = + - @ est préfixée d'une apostrophe).
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function exportFileName(
  kind: "attendance" | "results",
  title: string,
  at: string,
  ext: string,
): string {
  const prefix = kind === "attendance" ? "feuille-de-presence" : "resultats";
  return `${prefix}-${slugify(title) || "ag"}-${at.slice(0, 10)}.${ext}`;
}

// Nombre exact (chaîne ou nombre de la base) pour un tableur : nombre si sûr, sinon texte.
export function toSheetNumber(value: number | string | null | undefined): number | string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : String(value);
}
