import Link from "next/link";
import { AssemblyTabs } from "@/components/assembly/assembly-tabs";
import { StatusBadge } from "@/components/assembly/status-badge";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ASSEMBLY_TYPE_LABELS, formatAssemblyDate, isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function AssemblyLayout({
  children,
  params,
}: LayoutProps<"/orgs/[orgId]/assemblies/[assemblyId]">) {
  const { orgId, assemblyId } = await params;
  const { org, assembly } = await requireAssembly(orgId, assemblyId);
  const basePath = `/orgs/${org.id}/assemblies/${assembly.id}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/orgs/${org.id}`} className="text-muted-foreground text-sm hover:underline">
          ← {org.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{assembly.title}</h1>
          <StatusBadge status={assembly.status} />
          {(assembly.status === "convened" || assembly.status === "in_session") && (
            <Link href={`/accueil/${assembly.id}`} className={buttonVariants({ size: "sm" })}>
              Ouvrir l&apos;accueil
            </Link>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {ASSEMBLY_TYPE_LABELS[assembly.type]} · {formatAssemblyDate(assembly.starts_at, assembly.timezone)}
          {assembly.location && ` · ${assembly.location}`}
        </p>
      </div>
      {!isEditableStatus(assembly.status) && (
        <Alert>
          L&apos;assemblée est en séance ou close : sa préparation est en lecture seule (toute correction
          passe par le bureau et est tracée).
        </Alert>
      )}
      <AssemblyTabs basePath={basePath} />
      {children}
    </div>
  );
}
