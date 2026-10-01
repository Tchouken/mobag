import type { Database } from "@/lib/database.types";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  org_admin: "Administrateur",
  organizer: "Organisateur",
};

export const ORG_ROLES = Object.keys(ORG_ROLE_LABELS) as OrgRole[];

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}
