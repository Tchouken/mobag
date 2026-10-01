import Link from "next/link";
import { ResolutionList, type ResolutionItem } from "@/components/resolutions/resolution-list";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { describeRule, majorityRuleSchema } from "@/lib/domain/rules";

export default async function ResolutionsPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/resolutions">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const editable = canManage && isEditableStatus(assembly.status);

  const { data, error } = await supabase
    .from("resolutions")
    .select(
      "id, parent_id, number, title, vote_type, is_secret, majority_rule, quorum_rule, weight_keys(label, is_primary), resolution_attachments(count)",
    )
    .eq("assembly_id", assembly.id)
    .order("position");
  if (error) throw error;

  const items: ResolutionItem[] = data.map((r) => {
    const majority = majorityRuleSchema.safeParse(r.majority_rule);
    return {
      id: r.id,
      parent_id: r.parent_id,
      number: r.number,
      title: r.title,
      is_information: r.vote_type === "information",
      is_secret: r.is_secret,
      weight_key_label: r.weight_keys?.label ?? "",
      is_primary_key: r.weight_keys?.is_primary ?? true,
      majority_text: majority.success ? describeRule(majority.data) : "",
      own_quorum: r.quorum_rule !== null,
      attachments: r.resolution_attachments[0]?.count ?? 0,
    };
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Ordre du jour ({items.length})</CardTitle>
          <CardDescription>
            {editable
              ? "Faites glisser les résolutions (ou utilisez le clavier) pour les réordonner ; la numérotation suit."
              : "Ordre du jour figé."}
            {assembly.status === "convened" &&
              " L'assemblée est convoquée : chaque modification est motivée et historisée."}
          </CardDescription>
        </div>
        {editable && (
          <Link
            href={`/orgs/${org.id}/assemblies/${assembly.id}/resolutions/new`}
            className={buttonVariants()}
          >
            Ajouter une résolution
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune résolution pour le moment.</p>
        ) : (
          <ResolutionList
            key={items.map((i) => `${i.id}:${i.number}`).join(",")}
            orgId={org.id}
            assemblyId={assembly.id}
            items={items}
            editable={editable}
          />
        )}
      </CardContent>
    </Card>
  );
}
