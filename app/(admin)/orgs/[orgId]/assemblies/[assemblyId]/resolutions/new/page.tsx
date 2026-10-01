import Link from "next/link";
import { notFound } from "next/navigation";
import { ResolutionForm } from "@/components/resolutions/resolution-form";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { loadResolutionFormContext } from "@/lib/resolutions";

export default async function NewResolutionPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/resolutions/new">) {
  const { orgId, assemblyId } = await params;
  const ctx = await requireAssembly(orgId, assemblyId);
  if (!ctx.canManage || !isEditableStatus(ctx.assembly.status)) notFound();
  const form = await loadResolutionFormContext(ctx, null);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orgs/${ctx.org.id}/assemblies/${ctx.assembly.id}/resolutions`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Ordre du jour
      </Link>
      <h2 className="text-xl font-semibold">Nouvelle résolution</h2>
      <ResolutionForm
        orgId={ctx.org.id}
        assemblyId={ctx.assembly.id}
        resolutionId={null}
        version={null}
        initial={form.defaults}
        keys={form.keys}
        parents={form.parents}
        majorityPresets={form.majorityPresets}
        quorumPresets={form.quorumPresets}
        assemblyQuorum={form.assemblyQuorum}
        showBoardRecommendation={form.showBoardRecommendation}
        requireReason={false}
        disabled={false}
      />
    </div>
  );
}
