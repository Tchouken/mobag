import { EditInfoForm } from "@/components/assembly/edit-info-form";
import { StatusActions } from "@/components/assembly/status-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isEditableStatus, toLocalParts, type LegalFamily, type LegalForm } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function AssemblyPage({ params }: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]">) {
  const { orgId, assemblyId } = await params;
  const { org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const editable = canManage && isEditableStatus(assembly.status);
  const local = toLocalParts(assembly.starts_at, assembly.timezone);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent>
          <EditInfoForm
            orgId={org.id}
            assemblyId={assembly.id}
            version={assembly.version}
            disabled={!editable}
            defaults={{
              title: assembly.title,
              type: assembly.type,
              legal_family: assembly.legal_family as LegalFamily,
              legal_form: (assembly.legal_form ?? "") as LegalForm | "",
              date: local.date,
              time: local.time,
              timezone: assembly.timezone,
              location: assembly.location ?? "",
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Statut</CardTitle>
          <CardDescription>Brouillon → convoquée → en séance → close → archivée.</CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <StatusActions orgId={org.id} assemblyId={assembly.id} status={assembly.status} />
          ) : (
            <p className="text-muted-foreground text-sm">Lecture seule.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
