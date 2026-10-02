import { describe, expect, it } from "vitest";
import {
  buildItems,
  editableMembers,
  isRetryable,
  parsePending,
  retryDelay,
  totalWeight,
  type OpenBallot,
} from "@/lib/voter/ballot";

const ballot = (allowChange: boolean, choices: (null | "for")[] = [null, null]): OpenBallot => ({
  ballot_id: "b",
  round: 1,
  closes_at: null,
  allow_vote_change: allowChange,
  is_secret: false,
  resolution: { id: "r", number: "1", title: "Comptes" },
  members: [
    { member_id: "m1", display_name: "Moi", weight: 3, via: "own", choice: choices[0]!, revision: null },
    {
      member_id: "m2",
      display_name: "Mandant",
      weight: "1.5",
      via: "proxy",
      choice: choices[1]!,
      revision: null,
    },
  ],
});

describe("vote : lot à envoyer", () => {
  it("même vote pour toutes les voix", () => {
    expect(buildItems(ballot(true), "same", "against", {})).toEqual([
      { member_id: "m1", choice: "against" },
      { member_id: "m2", choice: "against" },
    ]);
    expect(buildItems(ballot(true), "same", null, {})).toBeNull();
  });

  it("vote distinct par mandant : tous les choix sont requis", () => {
    expect(buildItems(ballot(true), "distinct", null, { m1: "for" })).toBeNull();
    expect(buildItems(ballot(true), "distinct", null, { m1: "for", m2: "abstain" })).toEqual([
      { member_id: "m1", choice: "for" },
      { member_id: "m2", choice: "abstain" },
    ]);
  });

  it("vote définitif : les voix déjà exprimées ne sont plus proposées", () => {
    expect(editableMembers(ballot(false, ["for", null])).map((m) => m.member_id)).toEqual(["m2"]);
    expect(buildItems(ballot(false, ["for", "for"]), "same", "against", {})).toBeNull();
    expect(editableMembers(ballot(true, ["for", "for"]))).toHaveLength(2);
  });

  it("additionne les voix en nombres", () => {
    expect(totalWeight(ballot(true).members)).toBe(4.5);
  });
});

describe("vote : réessais", () => {
  it("réessaie les pannes réseau et la limitation, pas les refus métier", () => {
    expect(isRetryable({ code: "", message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isRetryable({ code: "08006", message: "connection failure" })).toBe(true);
    expect(isRetryable({ code: "P0001", message: "rate_limited" })).toBe(true);
    expect(isRetryable({ code: "P0001", message: "ballot_not_open" })).toBe(false);
    expect(isRetryable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });

  it("attente exponentielle plafonnée", () => {
    expect([1, 2, 3, 4, 5, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });

  it("relit un envoi en attente conservé sur l'appareil", () => {
    const pending = { key: "k", items: [{ member_id: "m1", choice: "for" }], at: 1 };
    expect(parsePending(JSON.stringify(pending))).toEqual(pending);
    expect(parsePending("{")).toBeNull();
    expect(
      parsePending(JSON.stringify({ key: "k", items: [{ member_id: "m1", choice: "peut-être" }] })),
    ).toBeNull();
    expect(parsePending(null)).toBeNull();
  });
});
