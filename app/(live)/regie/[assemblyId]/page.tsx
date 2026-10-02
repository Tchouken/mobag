import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegieApp } from "@/components/regie/regie-app";
import { Alert } from "@/components/ui/alert";
import { requireStaffUser } from "@/lib/auth/staff";
import type { RegieSnapshot } from "@/lib/regie/model";
import { renderRichText } from "@/lib/rich-text/render";

export const metadata: Metadata = { title: "Régie — MobAG" };

export default async function RegiePage({ params }: PageProps<"/regie/[assemblyId]">) {
  const { assemblyId } = await params;
  const { supabase, user, isPlatformAdmin } = await requireStaffUser();
  const { data: assembly } = await supabase
    .from("assemblies")
    .select("id, org_id, status")
    .eq("id", assemblyId)
    .maybeSingle();
  if (!assembly) notFound();
  const backHref = `/orgs/${assembly.org_id}/assemblies/${assembly.id}`;

  if (assembly.status === "draft") {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
        <Alert>La régie s&apos;ouvre une fois l&apos;assemblée convoquée.</Alert>
        <Link href={backHref} className="text-sm hover:underline">
          ← Retour à l&apos;assemblée
        </Link>
      </main>
    );
  }

  const [{ data: snapshot }, { data: resolutions }, { data: roles }] = await Promise.all([
    supabase.rpc("regie_snapshot", { p_assembly: assembly.id }),
    supabase.from("resolutions").select("id, body").eq("assembly_id", assembly.id),
    supabase.from("assembly_staff").select("role").eq("assembly_id", assembly.id).eq("user_id", user.id),
  ]);
  if (!snapshot) notFound();

  // Rôles de séance (miroir de private.is_bureau / has_assembly_role) : le super-admin les a tous.
  const mine = new Set((roles ?? []).map((r) => r.role));
  const isBureau =
    isPlatformAdmin || ["president", "secretary", "scrutineer"].some((r) => mine.has(r as never));
  const isPresident = isPlatformAdmin || mine.has("president");
  const bodies = Object.fromEntries((resolutions ?? []).map((r) => [r.id, renderRichText(r.body)]));

  return (
    <RegieApp
      initial={snapshot as unknown as RegieSnapshot}
      bodies={bodies}
      isBureau={isBureau}
      isPresident={isPresident}
      backHref={backHref}
    />
  );
}
