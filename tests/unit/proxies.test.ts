import { describe, expect, it } from "vitest";
import { buildProxyRows, guessProxyMapping, normalizeProxyType } from "@/lib/import/proxy-mapping";
import { canBeDerogated, parseViolations, violationMessage } from "@/lib/proxies";

describe("violationMessage", () => {
  it("chiffre un dépassement du nombre de pouvoirs", () => {
    expect(violationMessage({ code: "max_count_exceeded", count: 4, max_count: 3 })).toBe(
      "Le mandataire détiendrait 4 pouvoirs (maximum 3).",
    );
  });

  it("chiffre un dépassement de la part des voix", () => {
    // Les espaces insécables (fines) d'Intl sont ramenées à des espaces simples pour comparer.
    expect(
      violationMessage({
        code: "max_share_exceeded",
        held: 600,
        total: 1100,
        max_share: { num: 1, den: 2 },
      }).replace(/[\u00a0\u202f]/g, " "),
    ).toBe("Le mandataire détiendrait 600 voix sur 1 100 (54,5 %), au-delà du plafond de 50 %.");
  });

  it("refuse toute dérogation pour un pouvoir à soi-même", () => {
    expect(canBeDerogated([{ code: "max_count_exceeded" }])).toBe(true);
    expect(canBeDerogated([{ code: "self_proxy" }, { code: "max_count_exceeded" }])).toBe(false);
  });

  it("lit le détail renvoyé par la base", () => {
    expect(parseViolations('[{"code": "holder_ineligible"}]')).toEqual([{ code: "holder_ineligible" }]);
    expect(parseViolations("pas du json")).toEqual([]);
    expect(parseViolations(null)).toEqual([]);
  });
});

describe("import des pouvoirs", () => {
  it("reconnaît les colonnes usuelles", () => {
    expect(
      guessProxyMapping(["Réf. mandant", "Mandataire", "Courriel mandataire", "Type de pouvoir"]),
    ).toEqual({
      grantor_ref: 0,
      holder_ref: null,
      holder_name: 1,
      holder_email: 2,
      type: 3,
    });
  });

  it("normalise le type", () => {
    expect(normalizeProxyType("En blanc")).toBe("blank");
    expect(normalizeProxyType("")).toBe("named");
    expect(normalizeProxyType("Nominatif")).toBe("named");
    expect(normalizeProxyType("procuration")).toBe("procuration");
  });

  it("construit les lignes en conservant les numéros du fichier", () => {
    const sheet = { sheetName: null, headers: ["a", "b"], rows: [{ line: 3, cells: ["M1", "Me Tiers"] }] };
    expect(buildProxyRows(sheet, { grantor_ref: 0, holder_name: 1 })).toEqual([
      { line: 3, grantor_ref: "M1", holder_name: "Me Tiers", type: "named" },
    ]);
  });
});
