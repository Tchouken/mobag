import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
export type AssemblyType = Enums["assembly_type"];
export type AssemblyStatus = Enums["assembly_status"];
export type StaffRole = Enums["staff_role"];
export type LegalFamily = "company" | "association" | "copro" | "other";
export type LegalForm = "sa" | "sas" | "sarl" | "sca" | "sci" | "other";

export const ASSEMBLY_TYPE_LABELS: Record<AssemblyType, string> = {
  ago: "AG ordinaire",
  age: "AG extraordinaire",
  mixed: "AG mixte",
  other: "Autre",
};

export const ASSEMBLY_STATUS_LABELS: Record<AssemblyStatus, string> = {
  draft: "Brouillon",
  convened: "Convoquée",
  in_session: "En séance",
  closed: "Close",
  archived: "Archivée",
};

// Ordre de priorité retenu (DECISIONS Q1).
export const LEGAL_FAMILY_LABELS: Record<LegalFamily, string> = {
  company: "Société",
  association: "Association",
  copro: "Copropriété",
  other: "Autre",
};

export const LEGAL_FORM_LABELS: Record<LegalForm, string> = {
  sa: "SA",
  sas: "SAS",
  sarl: "SARL",
  sca: "SCA",
  sci: "SCI",
  other: "Autre forme",
};

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  president: "Président de séance",
  secretary: "Secrétaire",
  scrutineer: "Scrutateur",
  reception: "Accueil / émargement",
};

export const TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Luxembourg",
  "Europe/Zurich",
  "Indian/Reunion",
  "America/Martinique",
  "America/Guadeloupe",
  "Pacific/Noumea",
  "Pacific/Tahiti",
];

export function isEditableStatus(status: AssemblyStatus): boolean {
  return status === "draft" || status === "convened";
}

// Date et heure murales d'un instant dans un fuseau donné (champs de formulaire).
export function toLocalParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function formatAssemblyDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone }).format(
    new Date(iso),
  );
}
