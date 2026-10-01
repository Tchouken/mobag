"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Action serveur (protégée contre le CSRF par la vérification d'origine de Next.js).
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
