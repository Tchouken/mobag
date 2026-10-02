import { describe, expect, it } from "vitest";
import {
  countdown,
  currentBallot,
  resolutionState,
  share,
  type BallotSummary,
  type RegieResolution,
} from "@/lib/regie/model";

const ballot = (round: number, status: BallotSummary["status"]): BallotSummary => ({
  id: `b${round}`,
  round,
  status,
  opened_at: "",
  closes_at: null,
  closed_at: null,
  validated_at: null,
  cancelled_reason: null,
  totals: {
    present_represented: { weight: 0, heads: 0 },
    all_members: { weight: 0, heads: 0 },
    quorum: { reached: true },
  },
  outcome: null,
  tallies: null,
  evaluation: null,
});
const resolution = (ballots: BallotSummary[], vote_type = "yes_no_abstain"): RegieResolution => ({
  id: "r",
  number: "1",
  title: "R",
  parent_id: null,
  vote_type,
  mode: "electronic",
  weight_key: "Voix",
  majority_rule: null,
  abstention_policy: "excluded",
  is_secret: false,
  board_recommendation: null,
  ballots,
});

describe("régie", () => {
  it("état d'une résolution selon son dernier tour non annulé", () => {
    expect(resolutionState(resolution([]))).toBe("to_vote");
    expect(resolutionState(resolution([], "information"))).toBe("information");
    expect(resolutionState(resolution([ballot(1, "open")]))).toBe("open");
    expect(resolutionState(resolution([ballot(1, "cancelled")]))).toBe("to_vote");
    expect(resolutionState(resolution([ballot(1, "cancelled"), ballot(2, "closed")]))).toBe("provisional");
    expect(currentBallot(resolution([ballot(1, "cancelled"), ballot(2, "validated")]))?.round).toBe(2);
  });

  it("formate parts et compte à rebours", () => {
    expect(share(1, 3)).toMatch(/^33,3\s%$/);
    expect(share(1, 0)).toBe("—");
    expect(countdown(null, 0)).toBeNull();
    expect(countdown(new Date(95_000).toISOString(), 0)).toBe("1:35");
    expect(countdown(new Date(1_000).toISOString(), 5_000)).toBe("0:00");
  });
});
