"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
  next: z.string().optional(),
});

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const origin = (await headers()).get("origin");
  if (!origin) {
    return { status: "error", message: "Requête invalide." };
  }
  const next = safeNextPath(parsed.data.next);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error?.status === 429) {
    return { status: "error", message: "Trop de demandes. Patientez une minute avant de réessayer." };
  }
  // Même réponse que l'adresse existe ou non : pas d'énumération des comptes.
  return {
    status: "sent",
    message: `Si cette adresse est autorisée, un lien de connexion vient d'être envoyé à ${parsed.data.email}.`,
  };
}
