// Formats proposés par type d'export (partagé entre la route et la page).
export const EXPORT_FORMATS = {
  attendance: ["pdf", "xlsx"],
  results: ["pdf", "xlsx", "csv"],
} as const;

export type ExportKind = keyof typeof EXPORT_FORMATS;
export type ExportFormat = "pdf" | "xlsx" | "csv";

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

export const KIND_LABELS: Record<ExportKind, string> = {
  attendance: "Feuille de présence",
  results: "Résultats des votes",
};

export function isExportRequest(kind: string, format: string | null): format is ExportFormat {
  return (
    kind in EXPORT_FORMATS &&
    format !== null &&
    (EXPORT_FORMATS[kind as ExportKind] as readonly string[]).includes(format)
  );
}
