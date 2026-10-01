import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberForm } from "@/components/members/member-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";

export default async function MemberPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/members/[memberId]">) {
  const { orgId, assemblyId, memberId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const [{ data: member }, { data: keys, error }] = await Promise.all([
    supabase
      .from("members")
      .select("*, member_weights(weight, weight_keys(code))")
      .eq("id", memberId)
      .eq("assembly_id", assembly.id)
      .maybeSingle(),
    supabase.from("weight_keys").select("code, label").eq("assembly_id", assembly.id).order("position"),
  ]);
  if (error) throw error;
  if (!member) notFound();

  // Le nom affiché n'est pré-rempli que s'il a été saisi explicitement (sinon il est recalculé).
  const computedName =
    member.kind === "legal_entity"
      ? member.company_name
      : [member.last_name?.toUpperCase(), member.first_name].filter(Boolean).join(" ");
  const weights = Object.fromEntries(
    member.member_weights.map((w) => [w.weight_keys?.code ?? "", String(w.weight)]),
  );

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
          <CardTitle>{member.display_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberForm
            orgId={org.id}
            assemblyId={assembly.id}
            memberId={member.id}
            version={member.version}
            keys={keys}
            disabled={!canManage || !isEditableStatus(assembly.status)}
            defaults={{
              kind: member.kind,
              last_name: member.last_name ?? "",
              first_name: member.first_name ?? "",
              company_name: member.company_name ?? "",
              display_name: member.display_name === computedName ? "" : member.display_name,
              external_ref: member.external_ref ?? "",
              email: member.email ?? "",
              phone: member.phone ?? "",
              representative_name: member.representative_name ?? "",
              is_proxy_ineligible: member.is_proxy_ineligible,
              weights,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
