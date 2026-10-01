import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberForm } from "@/components/members/member-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function NewMemberPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/members/new">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  if (!canManage || !isEditableStatus(assembly.status)) notFound();
  const { data: keys, error } = await supabase
    .from("weight_keys")
    .select("code, label")
    .eq("assembly_id", assembly.id)
    .order("position");
  if (error) throw error;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orgs/${org.id}/assemblies/${assembly.id}/members`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Participants
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nouveau membre</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberForm
            orgId={org.id}
            assemblyId={assembly.id}
            memberId={null}
            version={null}
            keys={keys}
            disabled={false}
            defaults={{
              kind: "person",
              last_name: "",
              first_name: "",
              company_name: "",
              display_name: "",
              external_ref: "",
              email: "",
              phone: "",
              representative_name: "",
              is_proxy_ineligible: false,
              weights: {},
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
