import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentsPanel } from "@/components/resolutions/attachments-panel";
import { ResolutionForm } from "@/components/resolutions/resolution-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { majorityRuleSchema, quorumRuleSchema } from "@/lib/domain/rules";
import type { ResolutionInput } from "@/lib/domain/resolution";
import { loadResolutionFormContext } from "@/lib/resolutions";

export default async function ResolutionPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/resolutions/[resolutionId]">) {
  const { orgId, assemblyId, resolutionId } = await params;
  const ctx = await requireAssembly(orgId, assemblyId);
  const { supabase, org, assembly, canManage } = ctx;
  const [{ data: r }, { data: attachments }] = await Promise.all([
    supabase
      .from("resolutions")
      .select("*")
      .eq("id", resolutionId)
      .eq("assembly_id", assembly.id)
      .maybeSingle(),
    supabase
      .from("resolution_attachments")
      .select("id, filename, size_bytes, path")
      .eq("resolution_id", resolutionId)
      .order("created_at"),
  ]);
  if (!r) notFound();
  const form = await loadResolutionFormContext(ctx, r.id);
  const editable = canManage && isEditableStatus(assembly.status);
  const base = `/orgs/${org.id}/assemblies/${assembly.id}/resolutions`;

  const initial: ResolutionInput = {
    parent_id: r.parent_id,
    title: r.title,
    body: r.body as ResolutionInput["body"],
    weight_key_id: r.weight_key_id,
    vote_type: r.vote_type === "information" ? "information" : "yes_no_abstain",
    majority_rule: r.majority_rule ? majorityRuleSchema.parse(r.majority_rule) : null,
    abstention_policy: r.abstention_policy as ResolutionInput["abstention_policy"],
    quorum_rule: r.quorum_rule ? quorumRuleSchema.parse(r.quorum_rule) : null,
    is_secret: r.is_secret,
    allow_vote_change: r.allow_vote_change,
    board_recommendation: r.board_recommendation as ResolutionInput["board_recommendation"],
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={base} className="text-muted-foreground text-sm hover:underline">
          ← Ordre du jour
        </Link>
        <Link href={`${base}/${r.id}/history`} className="text-sm hover:underline">
          Historique des versions (version {r.version})
        </Link>
      </div>
      <h2 className="text-xl font-semibold">Résolution {r.number}</h2>
      <ResolutionForm
        orgId={org.id}
        assemblyId={assembly.id}
        resolutionId={r.id}
        version={r.version}
        initial={initial}
        keys={form.keys}
        parents={form.parents}
        majorityPresets={form.majorityPresets}
        quorumPresets={form.quorumPresets}
        assemblyQuorum={form.assemblyQuorum}
        showBoardRecommendation={form.showBoardRecommendation}
        requireReason={assembly.status !== "draft"}
        disabled={!editable}
      />
      <Card>
        <CardHeader>
          <CardTitle>Pièces jointes</CardTitle>
        </CardHeader>
        <CardContent>
          <AttachmentsPanel
            orgId={org.id}
            assemblyId={assembly.id}
            resolutionId={r.id}
            attachments={attachments ?? []}
            editable={editable}
          />
        </CardContent>
      </Card>
    </div>
  );
}
