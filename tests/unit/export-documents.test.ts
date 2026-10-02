import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { AttendanceData, ResultsData } from "@/lib/exports/model";
import { attendancePdf, resultsPdf } from "@/lib/exports/pdf";
import { attendanceXlsx, resultsCsv } from "@/lib/exports/sheets";

// PNG 1×1 en guise de signature.
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const assembly = {
  id: "ag",
  title: "AG de la résidence « Les Érables » — 漢字",
  type: "ago",
  status: "in_session",
  starts_at: "2026-06-15T16:00:00Z",
  timezone: "Europe/Paris",
  location: "Salle polyvalente",
  organization: "Syndic Œuvre & Cie",
};

function bigAttendance(n: number): AttendanceData {
  return {
    assembly,
    keys: [
      { code: "voix", label: "Tantièmes généraux", is_primary: true },
      { code: "asc", label: "Ascenseur", is_primary: false },
    ],
    members: Array.from({ length: n }, (_, i) => ({
      ref: `L${i + 1}`,
      name: `COPROPRIÉTAIRE N° ${i + 1} avec un nom très long qui ne tient pas dans la colonne`,
      kind: "person" as const,
      representative: null,
      weights: { voix: "12.500000", asc: 3 },
      presence: i % 3 === 0 ? "present" : i % 3 === 1 ? "represented" : "expected",
      holder: i % 3 === 1 ? "Mandataire" : null,
      proxy_type: i % 3 === 1 ? "named" : null,
      attendee:
        i % 3 === 0
          ? {
              name: "Présent",
              status: "present",
              checked_in_at: "2026-06-15T15:55:00Z",
              checked_out_at: null,
              signature_path: `s/${i}.png`,
            }
          : null,
    })),
    others: [
      {
        name: "Maître Ñandú 🙂",
        status: "present",
        checked_in_at: "2026-06-15T15:50:00Z",
        checked_out_at: null,
        signature_path: null,
        proxies: 2,
      },
    ],
    quorum: [
      {
        weight_key: { label: "Tantièmes généraux" },
        counts: { present: { weight: 1, heads: 1 }, all_members: { weight: 2, heads: 2 } },
        evaluation: { reached: true },
        rule: null,
      },
    ],
    bureau: [
      { role: "president", name: "Mme Présidente" },
      { role: "scrutineer", name: null },
      { role: "secretary", name: "M. Secrétaire" },
    ],
    generated_at: "2026-06-15T19:00:00Z",
  };
}

describe("exports : documents", () => {
  it("feuille de présence de 2 000 membres avec signatures, en quelques secondes", async () => {
    const data = bigAttendance(2000);
    const signatures = new Map(
      data.members.filter((m) => m.attendee).map((m) => [m.attendee!.signature_path!, PNG] as const),
    );
    const t0 = performance.now();
    const pdf = await attendancePdf(data, signatures);
    const xlsx = await attendanceXlsx(data, signatures);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(15000);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(80);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Feuille de présence")!;
    expect(sheet.rowCount).toBe(2002);
    expect(sheet.getImages()).toHaveLength(667);
    expect(sheet.getRow(2).getCell(3).value).toBe(12.5);
  }, 30000);

  it("résultats : tours annulés, provisoires, non votés, caractères hors police", async () => {
    const tally = (w: number, h: number) => ({ weight: w, heads: h });
    const data: ResultsData = {
      assembly,
      resolutions: [
        {
          number: "1",
          title: "Approbation des comptes ≥ 2025 ✓",
          vote_type: "yes_no_abstain",
          weight_key: "Voix",
          majority_rule: {
            conditions: [
              { measure: "weight", numerator: "for", base: "expressed", num: 1, den: 2, comparison: "gt" },
            ],
          },
          abstention_policy: "excluded",
          is_secret: true,
          ballots: [
            {
              round: 1,
              status: "cancelled",
              opened_at: assembly.starts_at,
              closed_at: assembly.starts_at,
              validated_at: null,
              cancelled_reason: "Panne",
              quorum: null,
              outcome: null,
              tallies: null,
              votes_digest: "ab".repeat(32),
            },
            {
              round: 2,
              status: "validated",
              opened_at: assembly.starts_at,
              closed_at: assembly.starts_at,
              validated_at: assembly.starts_at,
              cancelled_reason: null,
              quorum: { reached: true },
              outcome: "adopted",
              tallies: {
                for: tally(3, 1),
                against: tally(1, 1),
                abstain: tally(0, 0),
                expressed: tally(4, 2),
                not_voted: tally(0, 0),
                present_represented: tally(4, 2),
              },
              votes_digest: "cd".repeat(32),
            },
          ],
        },
        {
          number: "2",
          title: "Information",
          vote_type: "information",
          weight_key: "Voix",
          majority_rule: null,
          abstention_policy: "excluded",
          is_secret: false,
          ballots: [],
        },
        {
          number: "3",
          title: "Budget",
          vote_type: "yes_no_abstain",
          weight_key: "Voix",
          majority_rule: null,
          abstention_policy: "included",
          is_secret: false,
          ballots: [],
        },
      ],
      generated_at: assembly.starts_at,
    };
    const pdf = await PDFDocument.load(await resultsPdf(data));
    expect(pdf.getPageCount()).toBe(1);
    const csv = new TextDecoder().decode(resultsCsv(data)).split("\r\n");
    expect(csv).toHaveLength(6); // en-tête, deux tours, information, non mise au vote, fin de ligne
    expect(csv[1]).toContain("Annulé");
    expect(csv[2]).toContain("Adoptée");
    expect(csv[4]).toContain("Non mise au vote");
  });
});
