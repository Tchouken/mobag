// Logique de l'écran de vote, sans dépendance à React (testée unitairement).

export type Choice = "for" | "against" | "abstain";

export const CHOICE_LABELS: Record<Choice, string> = {
  for: "Pour",
  against: "Contre",
  abstain: "Abstention",
};
export const CHOICES: Choice[] = ["for", "against", "abstain"];

export type HeldMember = {
  member_id: string;
  display_name: string;
  weight: number | string;
  via: "own" | "proxy";
  choice: Choice | null;
  revision: number | null;
};

export type OpenBallot = {
  ballot_id: string;
  round: number;
  closes_at: string | null;
  allow_vote_change: boolean;
  is_secret: boolean;
  resolution: { id: string; number: string; title: string };
  members: HeldMember[];
};

export type VoteItem = { member_id: string; choice: Choice };

// Membres dont le vote peut encore être envoyé (pas encore voté, ou modification permise).
export function editableMembers(ballot: OpenBallot): HeldMember[] {
  return ballot.members.filter((m) => m.choice === null || ballot.allow_vote_change);
}

// Lot à envoyer : même choix pour toutes les voix modifiables, ou choix par mandant.
// Renvoie null tant qu'un membre n'a pas de choix (mode distinct).
export function buildItems(
  ballot: OpenBallot,
  mode: "same" | "distinct",
  same: Choice | null,
  perMember: Record<string, Choice | undefined>,
): VoteItem[] | null {
  const members = editableMembers(ballot);
  if (members.length === 0) return null;
  if (mode === "same") {
    return same ? members.map((m) => ({ member_id: m.member_id, choice: same })) : null;
  }
  const items = members.map((m) => ({ member_id: m.member_id, choice: perMember[m.member_id] }));
  return items.every((i) => i.choice) ? (items as VoteItem[]) : null;
}

export function totalWeight(members: { weight: number | string }[]): number {
  return members.reduce((sum, m) => sum + Number(m.weight), 0);
}

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

// Un envoi est réessayé s'il n'a pas atteint la base (réseau coupé, délai dépassé, serveur
// indisponible) ou si l'appareil est momentanément limité ; une erreur métier est définitive.
export function isRetryable(error: RpcError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "P0001") return error.message === "rate_limited";
  if (code === "") return true; // fetch échoué : aucune réponse du serveur
  return code.startsWith("08") || code === "57014" || code === "57P01" || code.startsWith("PGRST0");
}

// Attente avant le réessai n (1, 2, 4, 8… s, plafonnée à 15 s).
export function retryDelay(attempt: number): number {
  return Math.min(15000, 1000 * 2 ** Math.max(0, attempt - 1));
}

// Envoi en attente, conservé sur l'appareil : si la page est rechargée avant la confirmation,
// l'envoi reprend avec la même clé (la base ne l'enregistre qu'une fois).
export type PendingVote = { key: string; items: VoteItem[]; at: number };

export const pendingKey = (ballotId: string) => `mobag.vote.${ballotId}`;

export function parsePending(raw: string | null): PendingVote | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingVote;
    const valid =
      typeof value.key === "string" &&
      Array.isArray(value.items) &&
      value.items.every((i) => typeof i.member_id === "string" && CHOICES.includes(i.choice));
    return valid ? value : null;
  } catch {
    return null;
  }
}
