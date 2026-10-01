import Link from "next/link";
import { notFound } from "next/navigation";
import { ProxyImportWizard } from "@/components/proxies/proxy-import-wizard";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function ProxyImportPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/proxies/import">) {
  const { orgId, assemblyId } = await params;
  const { org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  if (!canManage || !["draft", "convened", "in_session"].includes(assembly.status)) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orgs/${org.id}/assemblies/${assembly.id}/proxies`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Pouvoirs
      </Link>
      <h2 className="text-xl font-semibold">Importer des pouvoirs</h2>
      <ProxyImportWizard orgId={org.id} assemblyId={assembly.id} />
    </div>
  );
}
