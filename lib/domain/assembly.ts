import { z } from "zod";

// Champs d'informations d'une assemblée (création et édition).
export const assemblyInfoSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(200),
  type: z.enum(["ago", "age", "mixed", "other"]),
  legal_family: z.enum(["company", "association", "copro", "other"]),
  legal_form: z.enum(["sa", "sas", "sarl", "sca", "sci", "other", ""]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide."),
  timezone: z.string().min(1),
  location: z.string().trim().max(300),
});

const FIELDS = [
  "title",
  "type",
  "legal_family",
  "legal_form",
  "date",
  "time",
  "timezone",
  "location",
] as const;

export function parseAssemblyInfo(formData: FormData) {
  return assemblyInfoSchema.safeParse(
    Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")])),
  );
}
