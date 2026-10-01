import Link from "next/link";
import { notFound } from "next/navigation";
import { GrantProxyForm } from "@/components/proxies/grant-proxy-form";
import type { MemberOption } from "@/components/proxies/member-combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAssembly } from "@/lib/auth/assembly";
import { isBureauMember } from "@/lib/auth/bureau";
import { proxyRulesSchema } from "@/lib/domain/rules";

export default async function NewProxyPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/proxies/new">) {
  const { orgId, assemblyId } = await params;
  const ctx = await requireAssembly(orgId, assemblyId);
  const { supabase, org, assembly, canManage } = ctx;
  if (!canManage || !["draft", "convened", "in_session"].includes(assembly.status)) notFound();

  const [{ data: members, error }, { data: live }, { data: presence }, { data: attendees }, bureau] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, display_name, external_ref, is_proxy_ineligible")
        .eq("assembly_id", assembly.id)
        .order("external_ref", { nullsFirst: false })
        .order("display_name"),
      supabase
        .from("proxies")
        .select("grantor_member_id")
        .eq("assembly_id", assembly.id)
        .in("status", ["active", "pending"]),
      supabase
        .from("member_presence")
        .select("member_id")
        .eq("assembly_id", assembly.id)
        .eq("status", "present"),
      supabase.from("attendees").select("id, full_name").eq("assembly_id", assembly.id).order("full_name"),
      isBureauMember(ctx),
    ]);
  if (error) throw error;

  const withProxy = new Set((live ?? []).map((p) => p.grantor_member_id));
  const present = new Set((presence ?? []).map((p) => p.member_id));
  const grantors: MemberOption[] = members.map((m) => ({
    id: m.id,
    label: m.display_name,
    ref: m.external_ref,
    disabled: withProxy.has(m.id) ? "pouvoir déjà donné" : present.has(m.id) ? "présent" : undefined,
  }));
  const holders: MemberOption[] = members.map((m) => ({
    id: m.id,
    label: m.display_name,
    ref: m.external_ref,
    disabled: m.is_proxy_ineligible ? "non éligible mandataire" : undefined,
  }));
  const rules = proxyRulesSchema.parse(assembly.proxy_rules);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orgs/${org.id}/assemblies/${assembly.id}/proxies`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Pouvoirs
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Saisir des pouvoirs</CardTitle>
          <CardDescription>
            Les règles de l&apos;assemblée (plafonds, non-éligibles) sont vérifiées à chaque saisie. Le
            formulaire se réinitialise après chaque pouvoir enregistré.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GrantProxyForm
            orgId={org.id}
            assemblyId={assembly.id}
            grantors={grantors}
            holders={holders}
            attendees={attendees ?? []}
            blankAllowed={rules.blank_to !== "none"}
            isBureau={bureau}
            blankHint={
              rules.blank_to === "board_recommendation"
                ? "le président vote selon l'avis du conseil"
                : rules.blank_to === "president"
                  ? "attribué au président de séance"
                  : "non admis pour cette assemblée"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
