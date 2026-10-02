import { describeRule, type RuleCondition } from "@/lib/domain/rules";
import { formatTime } from "./text";

export type Measure = { weight: number | string; heads: number };

type AssemblyInfo = {
  id: string;
  title: string;
  type: string;
  status: string;
  starts_at: string;
  timezone: string;
  location: string | null;
  organization: string;
};

export type AttendanceData = {
  assembly: AssemblyInfo;
  keys: { code: string; label: string; is_primary: boolean }[];
  members: {
    ref: string | null;
    name: string;
    kind: "person" | "legal_entity";
    representative: string | null;
    weights: Record<string, number | string>;
    presence: string;
    holder: string | null;
    proxy_type: string | null;
    attendee: {
      name: string;
      status: string;
      checked_in_at: string | null;
      checked_out_at: string | null;
      signature_path: string | null;
    } | null;
  }[];
  others: {
    name: string;
    status: string;
    checked_in_at: string | null;
    checked_out_at: string | null;
    signature_path: string | null;
    proxies: number;
  }[];
  quorum: {
    weight_key: { label: string };
    counts: Record<string, Measure>;
    evaluation: { reached: boolean };
    rule: unknown;
  }[];
  bureau: { role: string; name: string | null }[];
  generated_at: string;
};

export type AttendanceRow = {
  ref: string;
  name: string;
  weights: (number | string)[];
  presence: string;
  arrival: string;
  departure: string;
  signer: string;
  signaturePath: string | null;
};

const PROXY_KIND: Record<string, string> = {
  named: "pouvoir",
  blank: "pouvoir en blanc",
  temporary: "départ",
};

// Une ligne par membre, puis une ligne par personne présente sans membre en propre (mandataire
// tiers). La signature est celle de la personne qui a émargé pour la ligne.
export function attendanceRows(data: AttendanceData): AttendanceRow[] {
  const tz = data.assembly.timezone;
  const rows: AttendanceRow[] = data.members.map((m) => {
    const a = m.attendee;
    const presence =
      m.presence === "present"
        ? a && a.name !== m.name
          ? `Présent (${a.name})`
          : "Présent"
        : m.presence === "represented"
          ? `Représenté par ${m.holder ?? "?"} (${PROXY_KIND[m.proxy_type ?? ""] ?? "pouvoir"})`
          : m.presence === "left"
            ? "Parti"
            : "Absent";
    const signed = a && a.checked_in_at ? a : null;
    return {
      ref: m.ref ?? "",
      name: m.kind === "legal_entity" && m.representative ? `${m.name} (repr. ${m.representative})` : m.name,
      weights: data.keys.map((k) => m.weights[k.code] ?? 0),
      presence,
      arrival: formatTime(signed?.checked_in_at, tz),
      departure: formatTime(signed?.checked_out_at, tz),
      signer: signed?.name ?? "",
      signaturePath: signed?.signature_path ?? null,
    };
  });
  for (const o of data.others) {
    rows.push({
      ref: "",
      name: o.name,
      weights: data.keys.map(() => ""),
      presence: o.proxies > 0 ? `Mandataire (${o.proxies} pouvoir${o.proxies > 1 ? "s" : ""})` : "Non membre",
      arrival: formatTime(o.checked_in_at, tz),
      departure: formatTime(o.checked_out_at, tz),
      signer: o.name,
      signaturePath: o.signature_path,
    });
  }
  return rows;
}

export const ROLE_LABELS: Record<string, string> = {
  president: "Président(e) de séance",
  secretary: "Secrétaire",
  scrutineer: "Scrutateur",
};

export type ResultsData = {
  assembly: AssemblyInfo;
  resolutions: {
    number: string;
    title: string;
    vote_type: string;
    weight_key: string;
    majority_rule: { conditions: RuleCondition[] } | null;
    abstention_policy: "excluded" | "included";
    is_secret: boolean;
    ballots: {
      round: number;
      status: "closed" | "validated" | "cancelled";
      opened_at: string;
      closed_at: string | null;
      validated_at: string | null;
      cancelled_reason: string | null;
      quorum: { reached: boolean } | null;
      outcome: string | null;
      tallies: Record<
        "for" | "against" | "abstain" | "expressed" | "not_voted" | "present_represented",
        Measure
      > | null;
      votes_digest: string | null;
    }[];
  }[];
  generated_at: string;
};

export const OUTCOME_LABELS: Record<string, string> = {
  adopted: "Adoptée",
  rejected: "Rejetée",
  no_quorum: "Quorum non atteint",
  information: "Information",
};

export function ballotStatusLabel(status: string): string {
  return status === "validated" ? "Validé" : status === "cancelled" ? "Annulé" : "Provisoire (non validé)";
}

export function majorityText(r: ResultsData["resolutions"][number]): string {
  if (r.vote_type === "information") return "Sans vote (information)";
  return `${describeRule(r.majority_rule)} · abstentions ${r.abstention_policy === "included" ? "comptées" : "non comptées"} · clé « ${r.weight_key} »`;
}

// Ligne de résultat à plat (CSV, tableur) : un tour de scrutin par ligne.
export function resultLines(data: ResultsData) {
  const tz = data.assembly.timezone;
  const lines = [];
  for (const r of data.resolutions) {
    if (r.ballots.length === 0) {
      lines.push({ r, b: null, tz });
      continue;
    }
    for (const b of r.ballots) lines.push({ r, b, tz });
  }
  return lines;
}
