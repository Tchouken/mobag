import "server-only";
import { notFound } from "next/navigation";
import { requireStaffUser } from "@/lib/auth/staff";
import type { OrgRole } from "@/lib/labels";

// Charge une organisation visible par l'utilisateur (RLS) et son rôle. Une organisation
// d'un autre client renvoie 404, sans révéler son existence.
export async function requireOrg(orgId: string) {
  const ctx = await requireStaffUser();
  const { data: org } = await ctx.supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) notFound();

  const { data: membership } = await ctx.supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  const role: OrgRole | null = membership?.role ?? null;
  return { ...ctx, org, role, canAdmin: ctx.isPlatformAdmin || role === "org_admin" };
}
