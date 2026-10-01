import type { Database } from "@/lib/database.types";
import { formatWeight } from "@/lib/format";

type Enums = Database["public"]["Enums"];

export const PROXY_TYPE_LABELS: Record<Enums["proxy_type"], string> = {
  named: "Nominatif",
  blank: "En blanc",
  temporary: "Temporaire (départ)",
};

export const PROXY_STATUS_LABELS: Record<Enums["proxy_status"], string> = {
  pending: "En attente du président",
  active: "Actif",
  revoked: "Révoqué",
};

export const REVOKED_KIND_LABELS: Record<string, string> = {
  manual: "révoqué",
  grantor_present: "mandant présent",
  transferred: "transmis au départ du mandataire",
  holder_returned: "rendu au retour du mandataire",
  president_changed: "changement de président",
};

export type Violation = {
  code: string;
  count?: number;
  max_count?: number;
  held?: number;
  total?: number;
  max_share?: { num: number; den: number };
};

const percent = (num: number, den: number) =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format((num / den) * 100)} %`;

// Explication en français d'une violation des règles de pouvoirs (détail fourni par la base).
export function violationMessage(v: Violation): string {
  const share = () =>
    v.held !== undefined && v.total && v.max_share
      ? `${formatWeight(v.held)} voix sur ${formatWeight(v.total)} (${percent(v.held, v.total)}), au-delà du plafond de ${percent(v.max_share.num, v.max_share.den)}`
      : "une part des voix supérieure au plafond";
  switch (v.code) {
    case "holder_ineligible":
      return "Cette personne ne peut pas recevoir de pouvoir (non éligible mandataire).";
    case "self_proxy":
      return "Un membre ne peut pas se donner pouvoir à lui-même.";
    case "max_count_exceeded":
      return `Le mandataire détiendrait ${v.count} pouvoirs (maximum ${v.max_count}).`;
    case "max_share_exceeded":
      return `Le mandataire détiendrait ${share()}.`;
    case "proxy_caps_exceeded":
      return `Le mandataire détiendrait ${v.count} pouvoirs (maximum ${v.max_count}) et ${share()}.`;
    default:
      return "Règle de pouvoirs non respectée.";
  }
}

// Une dérogation reste impossible pour un pouvoir à soi-même.
export function canBeDerogated(violations: Violation[]): boolean {
  return violations.length > 0 && !violations.some((v) => v.code === "self_proxy");
}

export function parseViolations(details: string | null | undefined): Violation[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details) as unknown;
    return Array.isArray(parsed) ? (parsed as Violation[]) : [];
  } catch {
    return [];
  }
}
