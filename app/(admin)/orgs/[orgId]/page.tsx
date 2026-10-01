import Link from "next/link";
import { StatusBadge } from "@/components/assembly/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ASSEMBLY_TYPE_LABELS,
  formatAssemblyDate,
  LEGAL_FAMILY_LABELS,
  type LegalFamily,
} from "@/lib/assembly-labels";
import { requireOrg } from "@/lib/auth/org";
import { ORG_ROLE_LABELS } from "@/lib/labels";

export default async function OrgPage({ params }: PageProps<"/orgs/[orgId]">) {
  const { orgId } = await params;
  const { supabase, org, role, isPlatformAdmin } = await requireOrg(orgId);
  const { data: assemblies, error } = await supabase
    .from("assemblies")
    .select("id, title, type, legal_family, status, starts_at, timezone")
    .eq("org_id", org.id)
    .order("starts_at", { ascending: false });
  if (error) throw error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/orgs" className="text-muted-foreground text-sm hover:underline">
          ← Organisations
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <Link
            href={`/orgs/${org.id}/members`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Équipe
          </Link>
        </div>
        <p className="text-muted-foreground text-sm">
          {role
            ? `Votre rôle : ${ORG_ROLE_LABELS[role]}`
            : isPlatformAdmin
              ? "Accès support (super-admin)"
              : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Assemblées générales</CardTitle>
            <CardDescription>Préparation, séance et exports.</CardDescription>
          </div>
          <Link href={`/orgs/${org.id}/assemblies/new`} className={buttonVariants()}>
            Nouvelle assemblée
          </Link>
        </CardHeader>
        <CardContent>
          {assemblies.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune assemblée pour le moment.</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {assemblies.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/orgs/${org.id}/assemblies/${a.id}`}
                    className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{a.title}</span>
                      <span className="text-muted-foreground text-sm">
                        {LEGAL_FAMILY_LABELS[a.legal_family as LegalFamily]} · {ASSEMBLY_TYPE_LABELS[a.type]}{" "}
                        · {formatAssemblyDate(a.starts_at, a.timezone)}
                      </span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
