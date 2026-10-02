import { describe, expect, it } from "vitest";
import { extractCode, formatCode, isCompleteCode, normalizeCode, voterLink } from "@/lib/voter/code";

describe("code de vote", () => {
  it("normalise comme la base (O→0, I/L→1, séparateurs retirés)", () => {
    expect(normalizeCode("ab0o-iL12 cd")).toBe("AB00111" + "2CD");
  });

  it("reconnaît un code complet", () => {
    expect(isCompleteCode("7K3M-9QX2-HT8V-4RNA")).toBe(true);
    expect(isCompleteCode("7K3M-9QX2")).toBe(false);
    expect(isCompleteCode("UUUU-UUUU-UUUU-UUUU")).toBe(false); // U absent de l'alphabet
  });

  it("formate par groupes de 4", () => {
    expect(formatCode("7k3m9qx2ht8v4rna")).toBe("7K3M-9QX2-HT8V-4RNA");
  });

  it("place le code dans le fragment du lien", () => {
    expect(voterLink("https://vote.exemple.fr", "7K3M-9QX2-HT8V-4RNA")).toBe(
      "https://vote.exemple.fr/v#7K3M9QX2HT8V4RNA",
    );
  });

  it("extrait le code d'un QR (lien ou code seul)", () => {
    expect(extractCode("https://vote.exemple.fr/v#7K3M9QX2HT8V4RNA")).toBe("7K3M9QX2HT8V4RNA");
    expect(extractCode("7K3M-9QX2-HT8V-4RNA")).toBe("7K3M9QX2HT8V4RNA");
    expect(extractCode("https://ailleurs.exemple/autre")).toBeNull();
  });
});
