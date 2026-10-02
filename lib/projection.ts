// État de l'écran de projection (public_state) et mise en forme.

export type Measure = { weight: number | string; heads: number };

export type ProjectionState = {
  assembly: { title: string; status: "convened" | "in_session" | "closed" };
  quorum: {
    weight_key: string;
    counts: { present_represented: Measure; all_members: Measure };
    has_rule: boolean;
    reached: boolean;
  };
  current: {
    number: string;
    title: string;
    closes_at: string | null;
    eligible: Measure;
    voted: Measure;
  } | null;
  result: {
    number: string;
    title: string;
    outcome: "adopted" | "rejected" | "no_quorum" | "information";
    validated_at: string;
    tallies: Record<"for" | "against" | "abstain" | "expressed", Measure>;
  } | null;
  at: string;
};

export const PROJECTION_OUTCOMES: Record<string, string> = {
  adopted: "Adoptée",
  rejected: "Rejetée",
  no_quorum: "Quorum non atteint",
  information: "Information",
};

// Barres du résultat : longueur proportionnelle au plus grand des trois décomptes (axe commun).
export function resultBars(tallies: Record<"for" | "against" | "abstain" | "expressed", Measure>) {
  const rows = (["for", "against", "abstain"] as const).map((key) => ({
    key,
    weight: Number(tallies[key].weight),
  }));
  const max = Math.max(...rows.map((r) => r.weight), 0);
  const expressed = Number(tallies.expressed.weight);
  return rows.map((r) => ({
    ...r,
    heads: tallies[r.key].heads,
    ratio: max > 0 ? r.weight / max : 0,
    shareOfExpressed: r.key !== "abstain" && expressed > 0 ? r.weight / expressed : null,
  }));
}

export function readProjectionToken(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return /^[0-9A-Za-z]{16,64}$/.test(token) ? token.toUpperCase() : null;
}
