import { describe, expect, it } from "vitest";
import { exportFileName, formatTime, slugify, toCsv, toSheetNumber, winAnsi } from "@/lib/exports/text";

describe("exports : texte", () => {
  it("garde les accents français, remplace l'inencodable", () => {
    expect(winAnsi("Élection — « Œuvre » à 50 %")).toBe("Élection — « Œuvre » à 50 %");
    expect(winAnsi("12 345 voix ≥ 2/3 ✓ 漢")).toBe("12 345 voix >= 2/3 v ?");
  });

  it("CSV pour tableur : séparateur, guillemets, formules neutralisées", () => {
    const csv = toCsv([
      ["Résolution", "Voix"],
      ['Comptes "2025"', 12.5],
      ["=SOMME(A1)", null],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Comptes ""2025""";12.5');
    expect(csv).toContain("'=SOMME(A1);");
  });

  it("noms de fichiers et nombres", () => {
    expect(slugify("AG de l'Été 2026 !")).toBe("ag-de-l-ete-2026");
    expect(exportFileName("attendance", "AG 2026", "2026-10-02T10:00:00Z", "pdf")).toBe(
      "feuille-de-presence-ag-2026-2026-10-02.pdf",
    );
    expect(toSheetNumber("1.500000")).toBe(1.5);
    expect(toSheetNumber(null)).toBe("");
  });

  it("heures dans le fuseau de l'AG", () => {
    expect(formatTime("2026-06-15T16:05:00Z", "Europe/Paris")).toBe("18:05");
  });
});
