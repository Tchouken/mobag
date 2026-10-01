import { describe, expect, it } from "vitest";
import { buildImportRows, guessMapping, hasNameColumn } from "@/lib/import/mapping";
import { decodeText, normalizeBoolean, normalizeKind, normalizeNumber } from "@/lib/import/table";

describe("normalizeNumber", () => {
  it.each([
    ["1 234,5", "1234.5"],
    ["1 234,50", "1234.50"],
    ["1.234,5", "1234.5"],
    ["1,234.5", "1234.5"],
    ["12,5", "12.5"],
    ["37.5", "37.5"],
    ["150", "150"],
    ["-3", "-3"],
    ["", ""],
    ["douze", "douze"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeNumber(input)).toBe(expected);
  });
});

describe("normalizeBoolean / normalizeKind", () => {
  it("reconnaît les formes usuelles", () => {
    expect(normalizeBoolean("Oui")).toBe(true);
    expect(normalizeBoolean("x")).toBe(true);
    expect(normalizeBoolean("")).toBe(false);
    expect(normalizeBoolean("peut-être")).toBe("peut-être");
    expect(normalizeKind("Personne morale")).toBe("legal_entity");
    expect(normalizeKind("PP")).toBe("person");
    expect(normalizeKind("")).toBeNull();
  });
});

describe("decodeText", () => {
  it("lit l'UTF-8 avec BOM", () => {
    const bytes = new TextEncoder().encode("﻿Prénom;Nom");
    expect(decodeText(bytes.buffer as ArrayBuffer)).toBe("Prénom;Nom");
  });

  it("se replie sur Windows-1252 (CSV Excel français)", () => {
    const bytes = new Uint8Array([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d]); // « Prénom » en cp1252
    expect(decodeText(bytes.buffer)).toBe("Prénom");
  });
});

describe("guessMapping", () => {
  const keys = [
    { code: "voix", label: "Voix" },
    { code: "pref", label: "Actions de préférence" },
  ];

  it("associe les en-têtes usuels, accents et ponctuation ignorés", () => {
    const mapping = guessMapping(
      [
        "N° associé",
        "NOM",
        "Prénom",
        "Raison sociale",
        "Courriel",
        "Tél.",
        "Actions de préférence",
        "Nombre d'actions",
      ],
      keys,
    );
    expect(mapping.fields.external_ref).toBe(0);
    expect(mapping.fields.last_name).toBe(1);
    expect(mapping.fields.first_name).toBe(2);
    expect(mapping.fields.company_name).toBe(3);
    expect(mapping.fields.email).toBe(4);
    expect(mapping.fields.phone).toBe(5);
    expect(mapping.weights).toEqual({ voix: 7, pref: 6 });
    expect(hasNameColumn(mapping)).toBe(true);
  });

  it("n'attribue jamais deux fois la même colonne", () => {
    const mapping = guessMapping(
      ["Nom", "Voix"],
      [
        { code: "voix", label: "Voix" },
        { code: "b", label: "Bâtiment B" },
      ],
    );
    expect(mapping.weights).toEqual({ voix: 1, b: null });
  });
});

describe("buildImportRows", () => {
  it("construit les lignes en conservant les numéros de ligne du fichier", () => {
    const sheet = {
      sheetName: null,
      headers: ["Nom", "Voix", "Inéligible", "Type"],
      rows: [{ line: 4, cells: ["Dupont", "1 234,5", "oui", "PM"] }],
    };
    const rows = buildImportRows(sheet, {
      fields: { last_name: 0, is_proxy_ineligible: 2, kind: 3 },
      weights: { voix: 1 },
    });
    expect(rows).toEqual([
      {
        line: 4,
        last_name: "Dupont",
        is_proxy_ineligible: true,
        kind: "legal_entity",
        weights: { voix: "1234.5" },
      },
    ]);
  });
});
