import "server-only";
import { describeRule, majorityRuleSchema, quorumRuleSchema } from "@/lib/domain/rules";
import type { ResolutionInput } from "@/lib/domain/resolution";
import type { requireAssembly } from "@/lib/auth/assembly";
import { loadPresets } from "@/lib/presets";
import { EMPTY_DOC } from "@/lib/rich-text/extensions";

type AssemblyContext = Awaited<ReturnType<typeof requireAssembly>>;

// Données communes aux formulaires de création et d'édition d'une résolution.
export async function loadResolutionFormContext(ctx: AssemblyContext, resolutionId: string | null) {
  const { supabase, assembly } = ctx;
  const [{ data: keys, error }, { data: tops }, presets] = await Promise.all([
    supabase
      .from("weight_keys")
      .select("id, label, is_primary")
      .eq("assembly_id", assembly.id)
      .order("position"),
    supabase
      .from("resolutions")
      .select("id, number, title, parent_id")
      .eq("assembly_id", assembly.id)
      .is("parent_id", null)
      .order("position"),
    loadPresets(supabase, assembly, ["majority", "quorum"]),
  ]);
  if (error) throw error;

  // Une résolution qui a des sous-résolutions ne peut pas être rattachée à une autre.
  let hasChildren = false;
  if (resolutionId) {
    const { count } = await supabase
      .from("resolutions")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", resolutionId);
    hasChildren = (count ?? 0) > 0;
  }

  const quorum = quorumRuleSchema.safeParse(assembly.quorum_rule);
  const proxyRules = assembly.proxy_rules as { blank_to?: string };
  const primary = keys.find((k) => k.is_primary);

  return {
    keys,
    parents: hasChildren ? [] : (tops ?? []).filter((t) => t.id !== resolutionId),
    majorityPresets: presets.filter((p) => p.kind === "majority"),
    quorumPresets: presets.filter((p) => p.kind === "quorum"),
    assemblyQuorum: quorum.success && quorum.data.conditions.length > 0 ? describeRule(quorum.data) : "aucun",
    showBoardRecommendation: proxyRules.blank_to === "board_recommendation",
    defaults: {
      parent_id: null,
      title: "",
      body: EMPTY_DOC,
      weight_key_id: primary?.id ?? keys[0]?.id ?? "",
      vote_type: "yes_no_abstain",
      majority_rule: majorityRuleSchema.parse(
        presets.find((p) => p.kind === "majority" && p.assembly_family !== "generic")?.params ??
          presets.find((p) => p.code === "simple_expressed")?.params,
      ),
      abstention_policy: "excluded",
      quorum_rule: null,
      is_secret: false,
      allow_vote_change: null,
      board_recommendation: null,
    } satisfies ResolutionInput,
  };
}
