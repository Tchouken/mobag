import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Contrôle d'accès à faire dans chaque page et chaque action serveur : le proxy
// n'est qu'une redirection de confort. Les droits réels sont appliqués par la RLS
// et les RPC.
export async function requireStaffUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous || !user.email) {
    redirect("/login");
  }

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, isPlatformAdmin: adminRow !== null };
}
