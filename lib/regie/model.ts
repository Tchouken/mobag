import type { RuleCondition } from "@/lib/domain/rules";

export type Measure = { weight: number | string; heads: number };

export type QuorumByKey = {
  weight_key: { id: string; code: string; label: string };
  counts: Record<string, Measure>;
  rule: { conditions: RuleCondition[] } | null;
  evaluation: { reached: boolean };
};

export type Outcome = "adopted" | "rejected" | "no_quorum" | "information";

export type BallotSummary = {
  id: string;
  round: number;
  status: "open" | "closed" | "validated" | "cancelled";
  opened_at: string;
  closes_at: string | null;
  closed_at: string | null;
  validated_at: string | null;
  cancelled_reason: string | null;
  totals: { present_represented: Measure; all_members: Measure; quorum: { reached: boolean } };
  outcome: Outcome | null;
  tallies: Record<"for" | "against" | "abstain" | "expressed" | "voted" | "not_voted", Measure> | null;
  evaluation: {
    majority: {
      reached: boolean;
      conditions: (RuleCondition & { value: number; base_value: number; met: boolean })[];
    };
  } | null;
};

export type RegieResolution = {
  id: string;
  number: string;
  title: string;
  parent_id: string | null;
  vote_type: string;
  mode: string;
  weight_key: string;
  majority_rule: { conditions: RuleCondition[] } | null;
  abstention_policy: "excluded" | "included";
  is_secret: boolean;
  board_recommendation: "for" | "against" | null;
  ballots: BallotSummary[];
};

export type BallotProgress = {
  ballot_id: string;
  closes_at: string | null;
  eligible: Measure;
  voted: Measure;
  without_holder: number;
};

export type RegieSnapshot = {
  assembly: {
    id: string;
    org_id: string;
    title: string;
    status: "draft" | "convened" | "in_session" | "closed" | "archived";
    settings: { hide_live_trend: boolean; allow_vote_change: boolean };
  };
  quorum: QuorumByKey[];
  devices: { present: number; issued: number; associated: number };
  resolutions: RegieResolution[];
  open_ballot: BallotProgress | null;
  at: string;
};

// Le scrutin qui compte pour une résolution : le dernier tour non annulé.
export function currentBallot(resolution: RegieResolution): BallotSummary | null {
  return [...resolution.ballots].reverse().find((b) => b.status !== "cancelled") ?? null;
}

export type ResolutionState = "information" | "to_vote" | "open" | "provisional" | "validated";

export function resolutionState(resolution: RegieResolution): ResolutionState {
  if (resolution.vote_type === "information") return "information";
  const ballot = currentBallot(resolution);
  if (!ballot) return "to_vote";
  if (ballot.status === "open") return "open";
  return ballot.status === "validated" ? "validated" : "provisional";
}

export const STATE_LABELS: Record<ResolutionState, string> = {
  information: "Information",
  to_vote: "À voter",
  open: "Vote ouvert",
  provisional: "Résultat provisoire",
  validated: "Résultat validé",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  adopted: "Adoptée",
  rejected: "Rejetée",
  no_quorum: "Quorum non atteint",
  information: "Information",
};

// Part exacte affichée en pourcentage (affichage seulement : les décisions sont calculées en base).
export function share(part: number | string, total: number | string): string {
  const p = Number(part);
  const t = Number(total);
  if (!(t > 0)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(p / t);
}

// Compte à rebours « m:ss » (0:00 une fois échu).
export function countdown(closesAt: string | null, now: number): string | null {
  if (!closesAt) return null;
  const left = Math.max(0, Math.ceil((new Date(closesAt).getTime() - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
