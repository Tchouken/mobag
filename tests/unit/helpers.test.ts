import { describe, expect, it } from "vitest";
import { rpcErrorCode, rpcErrorMessage } from "@/lib/rpc/errors";
import { safeNextPath } from "@/lib/safe-redirect";
import { slugify } from "@/lib/slug";

describe("rpcErrorMessage", () => {
  it("traduit un code métier", () => {
    expect(rpcErrorMessage({ code: "P0001", message: "last_org_admin" })).toBe(
      "L'organisation doit conserver au moins un administrateur.",
    );
  });

  it("traite un refus de privilège Postgres comme un défaut de droits", () => {
    expect(rpcErrorCode({ code: "42501", message: "permission denied for table organizations" })).toBe(
      "forbidden",
    );
  });

  it("ne divulgue pas le message technique d'une erreur inconnue", () => {
    const message = rpcErrorMessage({ code: "XX000", message: "relation secrète" });
    expect(message).not.toContain("secrète");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/orgs/42", "/orgs/42"],
    [null, "/orgs"],
    ["https://evil.test", "/orgs"],
    ["//evil.test", "/orgs"],
    ["/\\evil.test", "/orgs"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("slugify", () => {
  it("retire accents et ponctuation", () => {
    expect(slugify("  Syndic Dupont & Fils — Île-de-France ")).toBe("syndic-dupont-fils-ile-de-france");
  });

  it("produit un identifiant accepté par la contrainte SQL", () => {
    expect(slugify("Résidence « Les Pins » n°3")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("toLocalParts", () => {
  it("rend l'heure murale du fuseau de l'assemblée (heure d'été)", async () => {
    const { toLocalParts } = await import("@/lib/assembly-labels");
    expect(toLocalParts("2026-06-15T12:00:00Z", "Europe/Paris")).toEqual({
      date: "2026-06-15",
      time: "14:00",
    });
  });

  it("gère un fuseau d'outre-mer", async () => {
    const { toLocalParts } = await import("@/lib/assembly-labels");
    expect(toLocalParts("2026-01-10T08:30:00Z", "Indian/Reunion")).toEqual({
      date: "2026-01-10",
      time: "12:30",
    });
  });
});
