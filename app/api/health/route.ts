import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPublicEnv } from "@/lib/env";

// Santé publique : base joignable, et nombre d'AG en séance ou imminentes (gel des
// déploiements, scripts/deploy-guard.mjs). Agrégats seulement.
export async function GET() {
  const env = getPublicEnv();
  const supabase = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false },
    },
  );
  const { data, error } = await supabase.rpc("platform_status");
  const headers = { "Cache-Control": "no-store" };
  if (error || !data) return Response.json({ status: "degraded", database: false }, { status: 503, headers });
  const status = data as { in_session: number; starting_soon: number; at: string };
  return Response.json(
    {
      status: "ok",
      database: true,
      assemblies_in_session: status.in_session,
      assemblies_starting_soon: status.starting_soon,
      deploy_freeze: status.in_session + status.starting_soon > 0,
      at: status.at,
    },
    { headers },
  );
}
