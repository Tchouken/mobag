import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ASSEMBLY_STATUS_LABELS } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { changedFields } from "@/lib/domain/resolution";
import { formatDateTime } from "@/lib/labels";
import { renderRichText } from "@/lib/rich-text/render";

const KIND_LABELS = { created: "Création", updated: "Modification", deleted: "Suppression" } as const;

export default async function HistoryPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/resolutions/[resolutionId]/history">) {
  const { orgId, assemblyId, resolutionId } = await params;
  const { supabase, org, assembly } = await requireAssembly(orgId, assemblyId);
  const { data: versions, error } = await supabase
    .from("resolution_versions")
    .select("id, version, change_kind, snapshot, assembly_status, reason, changed_by, changed_at")
    .eq("resolution_id", resolutionId)
    .eq("assembly_id", assembly.id)
    .order("id");
  if (error) throw error;

  const authorIds = [...new Set(versions.map((v) => v.changed_by).filter((id): id is string => id !== null))];
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", authorIds)
    : { data: [] };
  const authorName = (id: string | null) => {
    const a = authors?.find((p) => p.id === id);
    return a?.full_name ?? a?.email ?? "—";
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orgs/${org.id}/assemblies/${assembly.id}/resolutions/${resolutionId}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Résolution
      </Link>
      <h2 className="text-xl font-semibold">Historique des versions</h2>
      {versions.length === 0 && <p className="text-muted-foreground text-sm">Aucun historique.</p>}
      <ol className="flex flex-col gap-4">
        {[...versions].reverse().map((v, index, list) => {
          const snapshot = v.snapshot as Record<string, unknown>;
          const previous = list[index + 1]?.snapshot as Record<string, unknown> | undefined;
          const changes = changedFields(previous ?? null, snapshot);
          const html = renderRichText(snapshot.body);
          return (
            <li key={v.id}>
              <Card>
                <CardHeader className="gap-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {KIND_LABELS[v.change_kind as keyof typeof KIND_LABELS]} — version {v.version}
                    {v.assembly_status !== "draft" && (
                      <Badge variant="warning">
                        Après convocation ({ASSEMBLY_STATUS_LABELS[v.assembly_status].toLowerCase()})
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">
                    {formatDateTime(v.changed_at)} · {authorName(v.changed_by)}
                    {v.reason && <> · Motif : « {v.reason} »</>}
                  </p>
                  {changes.length > 0 && <p className="text-sm">Modifié : {changes.join(", ")}</p>}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="font-medium">
                    {String(snapshot.number ?? "")}. {String(snapshot.title ?? "")}
                  </p>
                  {html !== null ? (
                    <div className="rich-text text-sm" dangerouslySetInnerHTML={{ __html: html }} />
                  ) : (
                    <p className="text-muted-foreground text-sm">Texte non affichable.</p>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
