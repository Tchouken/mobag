import "server-only";
import ExcelJS from "exceljs";
import {
  attendanceRows,
  ballotStatusLabel,
  majorityText,
  OUTCOME_LABELS,
  resultLines,
  type AttendanceData,
  type ResultsData,
} from "./model";
import { formatDateTime, toCsv, toSheetNumber } from "./text";

function workbook(title: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MobAG";
  wb.title = title;
  wb.created = new Date();
  return wb;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// ===== Feuille de présence =====
export async function attendanceXlsx(
  data: AttendanceData,
  signatures: Map<string, Uint8Array>,
): Promise<Uint8Array> {
  const wb = workbook(`Feuille de présence — ${data.assembly.title}`);
  const sheet = wb.addWorksheet("Feuille de présence");
  sheet.columns = [
    { header: "Réf.", width: 10 },
    { header: "Membre", width: 36 },
    ...data.keys.map((k) => ({ header: k.label, width: 12 })),
    { header: "Présence", width: 36 },
    { header: "Arrivée", width: 9 },
    { header: "Départ", width: 9 },
    { header: "Émargé par", width: 24 },
    { header: "Signature", width: 22 },
  ];
  styleHeader(sheet);
  const signatureCol = sheet.columns.length - 1;
  const images = new Map<string, number>();
  for (const [path, bytes] of signatures) {
    images.set(path, wb.addImage({ buffer: Buffer.from(bytes) as never, extension: "png" }));
  }
  attendanceRows(data).forEach((r, i) => {
    const row = sheet.addRow([
      r.ref,
      r.name,
      ...r.weights.map(toSheetNumber),
      r.presence,
      r.arrival,
      r.departure,
      r.signer,
    ]);
    const image = r.signaturePath ? images.get(r.signaturePath) : undefined;
    if (image !== undefined) {
      row.height = 30;
      sheet.addImage(image, {
        tl: { col: signatureCol, row: i + 1 },
        ext: { width: 140, height: 36 },
        editAs: "oneCell",
      });
    }
  });

  const summary = wb.addWorksheet("Récapitulatif");
  summary.columns = [
    { header: "Clé", width: 24 },
    { header: "Présents (voix)", width: 16 },
    { header: "Présents (membres)", width: 18 },
    { header: "Représentés (voix)", width: 18 },
    { header: "Représentés (membres)", width: 20 },
    { header: "Total (voix)", width: 14 },
    { header: "Total (membres)", width: 16 },
    { header: "Quorum atteint", width: 16 },
  ];
  styleHeader(summary);
  for (const q of data.quorum) {
    const c = q.counts;
    summary.addRow([
      q.weight_key.label,
      toSheetNumber(c.present?.weight),
      c.present?.heads ?? 0,
      toSheetNumber(c.represented?.weight),
      c.represented?.heads ?? 0,
      toSheetNumber(c.all_members?.weight),
      c.all_members?.heads ?? 0,
      q.evaluation.reached ? "oui" : "non",
    ]);
  }
  summary.addRow([]);
  summary.addRow([`Généré le ${formatDateTime(data.generated_at, data.assembly.timezone)}`]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ===== Résultats =====
const RESULT_HEADERS = [
  "Résolution",
  "Titre",
  "Règle",
  "Tour",
  "Statut",
  "Résultat",
  "Pour (voix)",
  "Pour (votants)",
  "Contre (voix)",
  "Contre (votants)",
  "Abstention (voix)",
  "Abstention (votants)",
  "Exprimés (voix)",
  "N'ont pas voté (voix)",
  "Ouvert le",
  "Clos le",
  "Validé le",
  "Motif d'annulation",
  "Empreinte des votes (SHA-256)",
];

function resultRows(data: ResultsData) {
  return resultLines(data).map(({ r, b, tz }) => {
    const t = b?.tallies;
    return [
      r.number,
      r.title,
      majorityText(r),
      b?.round ?? "",
      b ? ballotStatusLabel(b.status) : r.vote_type === "information" ? "Information" : "Non mise au vote",
      b?.outcome ? OUTCOME_LABELS[b.outcome] : "",
      toSheetNumber(t?.for.weight),
      t?.for.heads ?? "",
      toSheetNumber(t?.against.weight),
      t?.against.heads ?? "",
      toSheetNumber(t?.abstain.weight),
      t?.abstain.heads ?? "",
      toSheetNumber(t?.expressed.weight),
      toSheetNumber(t?.not_voted.weight),
      formatDateTime(b?.opened_at, tz),
      formatDateTime(b?.closed_at, tz),
      formatDateTime(b?.validated_at, tz),
      b?.cancelled_reason ?? "",
      b?.votes_digest ?? "",
    ];
  });
}

export async function resultsXlsx(data: ResultsData): Promise<Uint8Array> {
  const wb = workbook(`Résultats — ${data.assembly.title}`);
  const sheet = wb.addWorksheet("Résultats");
  sheet.columns = RESULT_HEADERS.map((header, i) => ({ header, width: [10, 40, 50][i] ?? 16 }));
  styleHeader(sheet);
  resultRows(data).forEach((row) => sheet.addRow(row));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function resultsCsv(data: ResultsData): Uint8Array {
  return new TextEncoder().encode(toCsv([RESULT_HEADERS, ...resultRows(data)]));
}
