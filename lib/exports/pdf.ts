import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatWeight } from "@/lib/format";
import {
  attendanceRows,
  ballotStatusLabel,
  majorityText,
  OUTCOME_LABELS,
  ROLE_LABELS,
  type AttendanceData,
  type ResultsData,
} from "./model";
import { formatDateTime, formatLongDate, winAnsi } from "./text";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const MARGIN = 36;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);

type Fonts = { regular: PDFFont; bold: PDFFont };

// Écrit un document page par page avec une position courante ; ajoute une page au besoin.
class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    readonly size: [number, number],
    readonly header: string,
  ) {
    this.newPage();
  }
  get width() {
    return this.size[0] - 2 * MARGIN;
  }
  newPage() {
    this.page = this.doc.addPage(this.size);
    this.y = this.size[1] - MARGIN;
    this.page.drawText(winAnsi(this.header), {
      x: MARGIN,
      y: this.y - 8,
      size: 8,
      font: this.fonts.regular,
      color: MUTED,
    });
    this.y -= 22;
  }
  ensure(height: number) {
    if (this.y - height < MARGIN + 16) this.newPage();
  }
  text(
    value: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    for (const line of wrap(winAnsi(value), font, size, this.width)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= opts.gap ?? 0;
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let value = winAnsi(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > width) value = value.slice(0, -1);
  return `${value}…`;
}

type Column = { title: string; width: number; align?: "left" | "right" };

// Tableau paginé (en-tête répété sur chaque page). `image` : signature dans la dernière colonne.
function table(
  w: Writer,
  columns: Column[],
  rows: { cells: string[]; image?: PDFImage | null; bold?: boolean }[],
  rowHeight: number,
) {
  const size = 8;
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  const scale = w.width / totalWidth;
  const cols = columns.map((c) => ({ ...c, width: c.width * scale }));
  const drawHeader = () => {
    w.ensure(rowHeight + 18);
    let x = MARGIN;
    for (const c of cols) {
      const label = fit(c.title, w.fonts.bold, size, c.width - 6);
      const tx = c.align === "right" ? x + c.width - 3 - w.fonts.bold.widthOfTextAtSize(label, size) : x + 3;
      w.page.drawText(label, { x: tx, y: w.y - 11, size, font: w.fonts.bold, color: INK });
      x += c.width;
    }
    w.y -= 16;
    w.page.drawLine({
      start: { x: MARGIN, y: w.y },
      end: { x: MARGIN + w.width, y: w.y },
      thickness: 0.8,
      color: INK,
    });
  };
  drawHeader();
  for (const row of rows) {
    if (w.y - rowHeight < MARGIN + 16) {
      w.newPage();
      drawHeader();
    }
    let x = MARGIN;
    const font = row.bold ? w.fonts.bold : w.fonts.regular;
    row.cells.forEach((cell, i) => {
      const c = cols[i]!;
      const label = fit(cell, font, size, c.width - 6);
      const tx = c.align === "right" ? x + c.width - 3 - font.widthOfTextAtSize(label, size) : x + 3;
      w.page.drawText(label, { x: tx, y: w.y - rowHeight / 2 - 3, size, font, color: INK });
      x += c.width;
    });
    if (row.image) {
      const c = cols[cols.length - 1]!;
      const box = { w: c.width - 6, h: rowHeight - 4 };
      const ratio = Math.min(box.w / row.image.width, box.h / row.image.height);
      w.page.drawImage(row.image, {
        x: MARGIN + w.width - c.width + 3,
        y: w.y - rowHeight + 2,
        width: row.image.width * ratio,
        height: row.image.height * ratio,
      });
    }
    w.y -= rowHeight;
    w.page.drawLine({
      start: { x: MARGIN, y: w.y },
      end: { x: MARGIN + w.width, y: w.y },
      thickness: 0.3,
      color: RULE,
    });
  }
  w.y -= 10;
}

async function finish(
  doc: PDFDocument,
  fonts: Fonts,
  generatedAt: string,
  timeZone: string,
): Promise<Uint8Array> {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = winAnsi(
      `Généré le ${formatDateTime(generatedAt, timeZone)} — page ${i + 1} / ${pages.length}`,
    );
    page.drawText(label, {
      x: page.getWidth() - MARGIN - fonts.regular.widthOfTextAtSize(label, 8),
      y: MARGIN - 14,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
  });
  return doc.save();
}

async function open(title: string): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(title));
  doc.setProducer("MobAG");
  doc.setCreator("MobAG");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  return { doc, fonts };
}

function assemblyLines(w: Writer, a: AttendanceData["assembly"], heading: string) {
  w.text(heading, { size: 16, bold: true });
  w.text(`${a.organization} — ${a.title}`, { size: 12, bold: true });
  w.text(`${formatLongDate(a.starts_at, a.timezone)}${a.location ? ` — ${a.location}` : ""}`, {
    size: 10,
    gap: 8,
  });
}

// ===== Feuille de présence =====
export async function attendancePdf(
  data: AttendanceData,
  signatures: Map<string, Uint8Array>,
): Promise<Uint8Array> {
  const { doc, fonts } = await open(`Feuille de présence — ${data.assembly.title}`);
  const w = new Writer(doc, fonts, A4_LANDSCAPE, `Feuille de présence — ${data.assembly.title}`);
  assemblyLines(w, data.assembly, "Feuille de présence");

  // Au plus trois clés de répartition dans le PDF (toutes dans le tableur).
  const keys = data.keys.slice(0, 3);
  const columns: Column[] = [
    { title: "Réf.", width: 40 },
    { title: "Membre", width: 170 },
    ...keys.map((k) => ({ title: k.label, width: 64, align: "right" as const })),
    { title: "Présence", width: 170 },
    { title: "Arrivée", width: 40 },
    { title: "Départ", width: 40 },
    { title: "Émargé par", width: 100 },
    { title: "Signature", width: 110 },
  ];
  const images = new Map<string, PDFImage>();
  for (const [path, bytes] of signatures) {
    try {
      images.set(path, await doc.embedPng(bytes));
    } catch {
      /* image illisible : la ligne reste sans signature */
    }
  }
  table(
    w,
    columns,
    attendanceRows(data).map((r) => ({
      cells: [
        r.ref,
        r.name,
        ...r.weights.slice(0, keys.length).map((v) => (v === "" ? "" : formatWeight(v))),
        r.presence,
        r.arrival,
        r.departure,
        r.signer,
        r.signaturePath && !images.has(r.signaturePath) ? "(signature indisponible)" : "",
      ],
      image: r.signaturePath ? images.get(r.signaturePath) : null,
    })),
    30,
  );
  if (data.keys.length > keys.length) {
    w.text(`Clés de répartition supplémentaires : voir l'export tableur.`, { size: 8, color: MUTED, gap: 6 });
  }

  w.ensure(120);
  w.text("Récapitulatif", { size: 12, bold: true, gap: 2 });
  table(
    w,
    [
      { title: "Clé", width: 140 },
      { title: "Présents", width: 90, align: "right" },
      { title: "Représentés", width: 90, align: "right" },
      { title: "Présents et représentés", width: 130, align: "right" },
      { title: "Total", width: 90, align: "right" },
      { title: "Quorum", width: 100 },
    ],
    data.quorum.map((q) => {
      const c = q.counts;
      const m = (k: string) => `${formatWeight(c[k]?.weight ?? 0)} (${c[k]?.heads ?? 0})`;
      const hasRule = Boolean((q.rule as { conditions?: unknown[] } | null)?.conditions?.length);
      return {
        cells: [
          q.weight_key.label,
          m("present"),
          m("represented"),
          m("present_represented"),
          m("all_members"),
          hasRule ? (q.evaluation.reached ? "Atteint" : "Non atteint") : "Non requis",
        ],
      };
    }),
    18,
  );
  w.text("Entre parenthèses : nombre de membres.", { size: 8, color: MUTED, gap: 10 });

  // Certification du bureau.
  w.ensure(110);
  w.text("Certifiée sincère et véritable par le bureau de séance :", { size: 10, bold: true, gap: 6 });
  const roles =
    data.bureau.length > 0
      ? data.bureau
      : [
          { role: "president", name: null },
          { role: "scrutineer", name: null },
        ];
  const slot = w.width / Math.max(roles.length, 2);
  roles.forEach((b, i) => {
    const x = MARGIN + i * slot;
    w.page.drawText(winAnsi(ROLE_LABELS[b.role] ?? b.role), { x, y: w.y - 10, size: 9, font: fonts.bold });
    if (b.name)
      w.page.drawText(fit(b.name, fonts.regular, 9, slot - 10), {
        x,
        y: w.y - 22,
        size: 9,
        font: fonts.regular,
      });
    w.page.drawLine({
      start: { x, y: w.y - 70 },
      end: { x: x + slot - 20, y: w.y - 70 },
      thickness: 0.5,
      color: MUTED,
    });
  });
  w.y -= 80;
  return finish(doc, fonts, data.generated_at, data.assembly.timezone);
}

// ===== Résultats =====
export async function resultsPdf(data: ResultsData): Promise<Uint8Array> {
  const { doc, fonts } = await open(`Résultats des votes — ${data.assembly.title}`);
  const w = new Writer(doc, fonts, A4_PORTRAIT, `Résultats des votes — ${data.assembly.title}`);
  const tz = data.assembly.timezone;
  assemblyLines(w, data.assembly, "Résultats des votes");

  for (const r of data.resolutions) {
    w.ensure(90);
    w.text(`Résolution ${r.number} — ${r.title}`, { size: 12, bold: true });
    w.text(majorityText(r), { size: 9, color: MUTED, gap: 2 });
    if (r.vote_type !== "information" && r.ballots.length === 0) {
      w.text("Non mise au vote.", { size: 10, gap: 10 });
      continue;
    }
    for (const b of r.ballots) {
      const outcome = b.outcome ? OUTCOME_LABELS[b.outcome] : "—";
      w.text(
        `${r.ballots.length > 1 ? `Tour ${b.round} — ` : ""}${b.status === "cancelled" ? "Vote annulé" : outcome} · ${ballotStatusLabel(b.status)}`,
        { size: 11, bold: true },
      );
      w.text(
        `Ouvert le ${formatDateTime(b.opened_at, tz)}, clos le ${formatDateTime(b.closed_at, tz)}${b.validated_at ? `, validé le ${formatDateTime(b.validated_at, tz)}` : ""}.${b.quorum && !b.quorum.reached ? " Quorum non atteint à l'ouverture." : ""}`,
        { size: 9 },
      );
      if (b.cancelled_reason) w.text(`Motif de l'annulation : ${b.cancelled_reason}`, { size: 9 });
      if (b.tallies) {
        const t = b.tallies;
        table(
          w,
          [
            { title: "", width: 160 },
            { title: "Voix", width: 90, align: "right" },
            { title: "Votants", width: 70, align: "right" },
          ],
          [
            ["Pour", t.for],
            ["Contre", t.against],
            ["Abstention", t.abstain],
            ["Suffrages exprimés", t.expressed],
            ["N'ont pas voté", t.not_voted],
            ["Présents et représentés", t.present_represented],
          ].map(([label, m], i) => ({
            cells: [
              label as string,
              formatWeight((m as { weight: number }).weight),
              String((m as { heads: number }).heads),
            ],
            bold: i === 3,
          })),
          15,
        );
      }
      if (b.votes_digest)
        w.text(`Empreinte des votes (SHA-256) : ${b.votes_digest}`, { size: 7, color: MUTED, gap: 8 });
    }
    w.y -= 6;
  }
  return finish(doc, fonts, data.generated_at, tz);
}
