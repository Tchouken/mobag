import "server-only";
import type { Preset } from "@/components/assembly/rule-editor";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Presets pertinents pour une AG : génériques et ceux de sa famille, limités à sa forme
// juridique (ou sans forme).
export async function loadPresets(
  supabase: Client,
  assembly: { legal_family: string; legal_form: string | null },
  kinds: ("majority" | "quorum" | "proxy")[],
): Promise<Preset[]> {
  const { data, error } = await supabase
    .from("rule_presets")
    .select(
      "code, kind, assembly_family, legal_form, label_fr, description_fr, legal_reference, params, abstention_policy",
    )
    .in("kind", kinds)
    .in("assembly_family", ["generic", assembly.legal_family])
    .order("position");
  if (error) throw error;
  return data.filter((p) => !p.legal_form || p.legal_form === assembly.legal_form);
}
