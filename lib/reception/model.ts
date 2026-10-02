import { normalizeHeader } from "@/lib/import/table";

export type PresenceStatus = "expected" | "present" | "represented" | "left" | "absent" | "correspondence";

export type SnapshotMember = {
  id: string;
  ref: string | null;
  name: string;
  kind: "person" | "legal_entity";
  representative: string | null;
  ineligible: boolean;
  weight: number;
  presence: PresenceStatus;
  holder_attendee_id: string | null;
  attendee_id: string | null;
  proxy: { id: string; type: string; status: string; holder_attendee_id: string | null } | null;
};

export type SnapshotAttendee = {
  id: string;
  full_name: string;
  email: string | null;
  status: "expected" | "present" | "left";
  version: number;
  checked_in_at: string | null;
  checked_out_at: string | null;
  has_signature: boolean;
  ineligible: boolean;
  member_ids: string[];
  proxy_member_ids: string[];
  device: { kind: "personal" | "loaned"; label: string | null; claimed: boolean } | null;
};

export type QuorumSnapshot = {
  counts: Record<string, { weight: number; heads: number }>;
  rule: { conditions: unknown[] } | null;
  evaluation: { reached: boolean };
  weight_key: { label: string };
};

export type ReceptionSnapshot = {
  assembly: {
    id: string;
    title: string;
    status: string;
    president_attendee_id: string | null;
    proxy_rules: { forbid_subdelegation?: boolean; allow_transfer_on_departure?: boolean };
  };
  members: SnapshotMember[];
  attendees: SnapshotAttendee[];
  quorum: QuorumSnapshot;
  at: string;
};

// Entrée de recherche : un membre (avec la personne qui le porte, s'il y en a une) ou une
// personne qui ne porte aucun membre (mandataire tiers).
export type Entry = {
  key: string;
  memberId: string | null;
  attendeeId: string | null;
  title: string;
  subtitle: string;
  ref: string | null;
  status: PresenceStatus | "expected";
  haystack: string;
};

export function buildEntries(snapshot: ReceptionSnapshot): Entry[] {
  const attendees = new Map(snapshot.attendees.map((a) => [a.id, a]));
  const entries: Entry[] = snapshot.members.map((m) => {
    const person = m.attendee_id ? attendees.get(m.attendee_id) : undefined;
    const holder = m.holder_attendee_id ? attendees.get(m.holder_attendee_id) : undefined;
    const subtitle =
      m.presence === "represented" && holder
        ? `Représenté par ${holder.full_name}`
        : m.proxy && !holder
          ? m.proxy.status === "pending"
            ? "Pouvoir en blanc"
            : `A donné pouvoir à ${attendees.get(m.proxy.holder_attendee_id ?? "")?.full_name ?? "—"}`
          : person && person.full_name !== m.name
            ? `Représenté par ${person.full_name}`
            : m.kind === "legal_entity" && m.representative
              ? `Représentant : ${m.representative}`
              : "";
    return {
      key: `m:${m.id}`,
      memberId: m.id,
      attendeeId: m.attendee_id,
      title: m.name,
      subtitle,
      ref: m.ref,
      status: m.presence,
      haystack: normalizeHeader(
        [m.name, m.ref, m.representative, person?.full_name].filter(Boolean).join(" "),
      ),
    };
  });
  for (const a of snapshot.attendees) {
    if (a.member_ids.length > 0) continue;
    entries.push({
      key: `a:${a.id}`,
      memberId: null,
      attendeeId: a.id,
      title: a.full_name,
      subtitle: a.proxy_member_ids.length
        ? `Mandataire (${a.proxy_member_ids.length} pouvoir(s))`
        : "Non membre",
      ref: null,
      status: a.status === "present" ? "present" : a.status === "left" ? "left" : "expected",
      haystack: normalizeHeader([a.full_name, a.email].filter(Boolean).join(" ")),
    });
  }
  return entries;
}

// Recherche instantanée : tous les mots doivent apparaître (accents et casse ignorés) ;
// une référence exacte passe en tête.
export function searchEntries(entries: Entry[], query: string, limit = 30): Entry[] {
  const words = normalizeHeader(query).split(" ").filter(Boolean);
  if (words.length === 0) return entries.slice(0, limit);
  const q = normalizeHeader(query);
  return entries
    .filter((e) => words.every((w) => e.haystack.includes(w)))
    .sort((a, b) => Number(normalizeHeader(b.ref ?? "") === q) - Number(normalizeHeader(a.ref ?? "") === q))
    .slice(0, limit);
}

export const PRESENCE_LABELS: Record<string, string> = {
  expected: "Attendu",
  present: "Présent",
  represented: "Représenté",
  left: "Parti",
  absent: "Absent",
  correspondence: "Vote par correspondance",
};

// Nom proposé pour la personne qui vient émarger au titre d'un membre : son représentant pour
// une personne morale, le membre lui-même sinon.
export function defaultAttendeeName(member: SnapshotMember): string {
  return member.kind === "legal_entity" && member.representative ? member.representative : member.name;
}

// Les pouvoirs détenus suivent-ils le partant (sous-délégation admise, ou transmission au
// départ autorisée — DECISIONS B1) ? Miroir de public.check_out.
export function heldProxiesFollowTransfer(rules: ReceptionSnapshot["assembly"]["proxy_rules"]): boolean {
  return !rules.forbid_subdelegation || Boolean(rules.allow_transfer_on_departure);
}
