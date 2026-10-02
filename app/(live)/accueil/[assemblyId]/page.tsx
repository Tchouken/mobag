import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceptionApp } from "@/components/reception/reception-app";
import { Alert } from "@/components/ui/alert";
import { requireStaffUser } from "@/lib/auth/staff";
import type { ReceptionSnapshot } from "@/lib/reception/model";

export const metadata: Metadata = { title: "Accueil — MobAG" };

export default async function ReceptionPage({ params }: PageProps<"/accueil/[assemblyId]">) {
  const { assemblyId } = await params;
  const { supabase, user, isPlatformAdmin } = await requireStaffUser();
  const { data: assembly } = await supabase
    .from("assemblies")
    .select("id, org_id, status")
    .eq("id", assemblyId)
    .maybeSingle();
  if (!assembly) notFound();
  const backHref = `/orgs/${assembly.org_id}/assemblies/${assembly.id}`;

  if (assembly.status !== "convened" && assembly.status !== "in_session") {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
        <Alert>L&apos;accueil est ouvert de la convocation à la clôture de la séance.</Alert>
        <Link href={backHref} className="text-sm hover:underline">
          ← Retour à l&apos;assemblée
        </Link>
      </main>
    );
  }

  const { data: snapshot } = await supabase.rpc("reception_snapshot", { p_assembly: assembly.id });
  if (!snapshot) notFound();

  // Bureau (miroir de private.is_bureau) : seul habilité aux dérogations.
  const { count } = await supabase
    .from("assembly_staff")
    .select("role", { count: "exact", head: true })
    .eq("assembly_id", assembly.id)
    .eq("user_id", user.id)
    .in("role", ["president", "secretary", "scrutineer"]);

  return (
    <ReceptionApp
      initial={snapshot as ReceptionSnapshot}
      isBureau={isPlatformAdmin || (count ?? 0) > 0}
      backHref={backHref}
    />
  );
}
