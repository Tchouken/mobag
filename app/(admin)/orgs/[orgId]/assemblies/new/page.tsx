import Link from "next/link";
import { CreateAssemblyForm } from "@/components/assembly/create-assembly-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/org";

export default async function NewAssemblyPage({ params }: PageProps<"/orgs/[orgId]/assemblies/new">) {
  const { orgId } = await params;
  const { org } = await requireOrg(orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/orgs/${org.id}`} className="text-muted-foreground text-sm hover:underline">
          ← {org.name}
        </Link>
        <h1 className="text-2xl font-semibold">Nouvelle assemblée</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateAssemblyForm orgId={org.id} />
        </CardContent>
      </Card>
    </div>
  );
}
