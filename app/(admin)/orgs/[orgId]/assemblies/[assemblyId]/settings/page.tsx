import { RulesForm } from "@/components/assembly/rules-form";
import { Alert } from "@/components/ui/alert";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { proxyRulesSchema, quorumRuleSchema, settingsSchema } from "@/lib/domain/rules";
import { loadPresets } from "@/lib/presets";

export default async function SettingsPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/settings">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);

  const relevant = await loadPresets(supabase, assembly, ["quorum", "proxy"]);

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        Ces règles sont des points de départ. Vérifiez-les au regard des statuts et des textes applicables :
        les modèles n&apos;ont pas encore été validés par un juriste.
      </Alert>
      <RulesForm
        orgId={org.id}
        assemblyId={assembly.id}
        version={assembly.version}
        disabled={!canManage || !isEditableStatus(assembly.status)}
        quorumPresets={relevant.filter((p) => p.kind === "quorum")}
        proxyPresets={relevant.filter((p) => p.kind === "proxy")}
        initial={{
          quorum: quorumRuleSchema.parse(assembly.quorum_rule ?? { conditions: [] }),
          proxy: proxyRulesSchema.parse(assembly.proxy_rules),
          settings: settingsSchema.parse(assembly.settings),
        }}
      />
    </div>
  );
}
