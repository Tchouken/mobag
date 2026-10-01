import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportWizard } from "@/components/members/import-wizard";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function ImportPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/members/import">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  if (!canManage || !isEditableStatus(assembly.status)) notFound();

  const [{ data: keys, error }, { count }] = await Promise.all([
    supabase.from("weight_keys").select("code, label").eq("assembly_id", assembly.id).order("position"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("assembly_id", assembly.id),
  ]);
  if (error) throw error;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orgs/${org.id}/assemblies/${assembly.id}/members`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Participants
      </Link>
      <h2 className="text-xl font-semibold">Importer des participants</h2>
      <ImportWizard orgId={org.id} assemblyId={assembly.id} keys={keys} hasMembers={(count ?? 0) > 0} />
    </div>
  );
}
