import { describe, expect, it } from "vitest";
import {
  buildEntries,
  defaultAttendeeName,
  heldProxiesFollowTransfer,
  searchEntries,
  type ReceptionSnapshot,
} from "@/lib/reception/model";

const snapshot: ReceptionSnapshot = {
  assembly: { id: "ag", title: "AG", status: "convened", president_attendee_id: null, proxy_rules: {} },
  quorum: { counts: {}, rule: null, evaluation: { reached: false }, weight_key: { label: "Voix" } },
  at: "",
  members: [
    {
      id: "m1",
      ref: "A1",
      name: "DUPONT Jean",
      kind: "person",
      representative: null,
      ineligible: false,
      weight: 10,
      presence: "present",
      holder_attendee_id: "p1",
      attendee_id: "p1",
      proxy: null,
    },
    {
      id: "m2",
      ref: "A2",
      name: "Holding Martin SAS",
      kind: "legal_entity",
      representative: "Paul Martin",
      ineligible: false,
      weight: 30,
      presence: "expected",
      holder_attendee_id: null,
      attendee_id: null,
      proxy: null,
    },
    {
      id: "m3",
      ref: "A12",
      name: "ÉTIENNE Zoé",
      kind: "person",
      representative: null,
      ineligible: false,
      weight: 5,
      presence: "represented",
      holder_attendee_id: "p1",
      attendee_id: null,
      proxy: { id: "x", type: "named", status: "active", holder_attendee_id: "p1" },
    },
  ],
  attendees: [
    {
      id: "p1",
      full_name: "Jean Dupont",
      email: null,
      status: "present",
      version: 2,
      checked_in_at: null,
      checked_out_at: null,
      has_signature: true,
      ineligible: false,
      member_ids: ["m1"],
      proxy_member_ids: ["m3"],
      device: null,
    },
    {
      id: "p2",
      full_name: "Maître Lefèvre",
      email: "lefevre@exemple.fr",
      status: "expected",
      version: 1,
      checked_in_at: null,
      checked_out_at: null,
      has_signature: false,
      ineligible: false,
      member_ids: [],
      proxy_member_ids: [],
      device: null,
    },
  ],
};

describe("accueil : recherche", () => {
  const entries = buildEntries(snapshot);

  it("présente les membres et les tiers sans membre", () => {
    expect(entries.map((e) => e.key)).toEqual(["m:m1", "m:m2", "m:m3", "a:p2"]);
  });

  it("indique qui représente un membre", () => {
    expect(entries.find((e) => e.memberId === "m3")?.subtitle).toBe("Représenté par Jean Dupont");
    expect(entries.find((e) => e.memberId === "m2")?.subtitle).toBe("Représentant : Paul Martin");
  });

  it("ignore accents et casse, exige tous les mots", () => {
    expect(searchEntries(entries, "zoe etienne").map((e) => e.memberId)).toEqual(["m3"]);
    expect(searchEntries(entries, "lefevre").map((e) => e.attendeeId)).toEqual(["p2"]);
    expect(searchEntries(entries, "paul martin").map((e) => e.memberId)).toEqual(["m2"]);
  });

  it("place la référence exacte en tête", () => {
    expect(searchEntries(entries, "a1").map((e) => e.ref)).toEqual(["A1", "A12"]);
    expect(searchEntries(entries, "a12")[0]?.ref).toBe("A12");
  });
});

describe("accueil : recherche avec ligatures", () => {
  it("« oeuvre » trouve « Œuvre »", async () => {
    const { normalizeHeader } = await import("@/lib/import/table");
    expect(normalizeHeader("SCI Œuvre Æther")).toBe("sci oeuvre aether");
  });
});

describe("accueil : règles d'affichage", () => {
  it("propose le représentant d'une personne morale", () => {
    expect(defaultAttendeeName(snapshot.members[1]!)).toBe("Paul Martin");
    expect(defaultAttendeeName(snapshot.members[0]!)).toBe("DUPONT Jean");
  });

  it("indique si les pouvoirs détenus suivent le partant", () => {
    expect(heldProxiesFollowTransfer({ forbid_subdelegation: true })).toBe(false);
    expect(heldProxiesFollowTransfer({ forbid_subdelegation: true, allow_transfer_on_departure: true })).toBe(
      true,
    );
    expect(heldProxiesFollowTransfer({ forbid_subdelegation: false })).toBe(true);
  });
});
