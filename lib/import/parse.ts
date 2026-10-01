import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { decodeText, type ParsedSheet } from "./table";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20000;

export class ImportFileError extends Error {}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return cellToText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
  }
  return String(value);
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportFileError("Fichier Excel illisible. Enregistrez-le au format .xlsx ou .csv.");
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw new ImportFileError("Le classeur ne contient aucune donnée.");

  const rows: { line: number; cells: string[] }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let col = 1; col <= sheet.columnCount; col++) cells.push(cellToText(row.getCell(col).value).trim());
    rows.push({ line: rowNumber, cells });
  });
  return splitHeader(rows, sheet.name);
}

function parseCsv(buffer: ArrayBuffer): ParsedSheet {
  const text = decodeText(buffer);
  const result = Papa.parse<string[]>(text, {
    delimitersToGuess: [";", ",", "\t", "|"],
    skipEmptyLines: false,
  });
  if (result.errors.some((e) => e.type === "Quotes")) {
    throw new ImportFileError("Fichier CSV mal formé (guillemets non fermés).");
  }
  const rows = result.data
    .map((cells, index) => ({ line: index + 1, cells: cells.map((c) => (c ?? "").trim()) }))
    .filter((row) => row.cells.some((c) => c !== ""));
  return splitHeader(rows, null);
}

function splitHeader(rows: { line: number; cells: string[] }[], sheetName: string | null): ParsedSheet {
  const [header, ...data] = rows;
  if (!header) throw new ImportFileError("Le fichier est vide.");
  if (data.length === 0) throw new ImportFileError("Le fichier ne contient qu'une ligne d'en-tête.");
  if (data.length > MAX_ROWS) {
    throw new ImportFileError(`Le fichier dépasse ${MAX_ROWS.toLocaleString("fr-FR")} lignes.`);
  }
  const width = Math.max(header.cells.length, ...data.map((r) => r.cells.length));
  const headers = Array.from({ length: width }, (_, i) => header.cells[i] || `Colonne ${i + 1}`);
  return {
    sheetName,
    headers,
    rows: data.map((r) => ({
      line: r.line,
      cells: Array.from({ length: width }, (_, i) => r.cells[i] ?? ""),
    })),
  };
}

export async function parseImportFile(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new ImportFileError("Le fichier est vide.");
  if (file.size > MAX_FILE_BYTES) throw new ImportFileError("Le fichier dépasse 5 Mo.");
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return parseXlsx(buffer);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(buffer);
  throw new ImportFileError("Format non pris en charge : utilisez un fichier .csv ou .xlsx.");
}
