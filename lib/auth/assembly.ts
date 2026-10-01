import "server-only";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/org";

// Charge une assemblée de l'organisation visible par l'utilisateur (RLS), sinon 404.
export async function requireAssembly(orgId: string, assemblyId: string) {
  const ctx = await requireOrg(orgId);
  const { data: assembly } = await ctx.supabase
    .from("assemblies")
    .select("*")
    .eq("id", assemblyId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!assembly) notFound();

  // Préparation : administrateurs et organisateurs (miroir de private.can_manage_assembly).
  const canManage = ctx.isPlatformAdmin || ctx.role !== null;
  return { ...ctx, assembly, canManage };
}
