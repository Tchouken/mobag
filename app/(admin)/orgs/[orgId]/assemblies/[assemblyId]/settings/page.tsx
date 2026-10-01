import { RulesForm } from "@/components/assembly/rules-form";
import { Alert } from "@/components/ui/alert";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { proxyRulesSchema, quorumRuleSchema, settingsSchema } from "@/lib/domain/rules";

export default async function SettingsPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/settings">) {
  const { orgId, assemblyId } = await params;
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);

  const { data: presets, error } = await supabase
    .from("rule_presets")
    .select("code, kind, assembly_family, legal_form, label_fr, description_fr, legal_reference, params")
    .in("kind", ["quorum", "proxy"])
    .in("assembly_family", ["generic", assembly.legal_family])
    .order("position");
  if (error) throw error;

  // Ne propose que les presets de la forme juridique de l'AG (ou sans forme).
  const relevant = presets.filter((p) => !p.legal_form || p.legal_form === assembly.legal_form);

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
