import "server-only";
import type { requireAssembly } from "@/lib/auth/assembly";

type AssemblyContext = Awaited<ReturnType<typeof requireAssembly>>;

// Membre du bureau de séance (miroir de private.is_bureau) : seul habilité aux dérogations.
export async function isBureauMember(ctx: AssemblyContext): Promise<boolean> {
  if (ctx.isPlatformAdmin) return true;
  const { count } = await ctx.supabase
    .from("assembly_staff")
    .select("role", { count: "exact", head: true })
    .eq("assembly_id", ctx.assembly.id)
    .eq("user_id", ctx.user.id)
    .in("role", ["president", "secretary", "scrutineer"]);
  return (count ?? 0) > 0;
}
