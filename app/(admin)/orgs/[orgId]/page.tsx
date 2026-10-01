import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/org";
import { ORG_ROLE_LABELS } from "@/lib/labels";

export default async function OrgPage({ params }: PageProps<"/orgs/[orgId]">) {
  const { orgId } = await params;
  const { org, role, isPlatformAdmin } = await requireOrg(orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/orgs" className="text-muted-foreground text-sm hover:underline">
          ← Organisations
        </Link>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-muted-foreground text-sm">
          {role
            ? `Votre rôle : ${ORG_ROLE_LABELS[role]}`
            : isPlatformAdmin
              ? "Accès support (super-admin)"
              : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assemblées générales</CardTitle>
            <CardDescription>Préparation, séance et exports des AG de l&apos;organisation.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Disponible prochainement.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Équipe</CardTitle>
            <CardDescription>Membres de l&apos;organisation, rôles et invitations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/orgs/${org.id}/members`} className={buttonVariants({ variant: "outline" })}>
              Gérer l&apos;équipe
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
