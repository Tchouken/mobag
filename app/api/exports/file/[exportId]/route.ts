import type { NextRequest } from "next/server";
import { exportFileName } from "@/lib/exports/text";
import { createClient } from "@/lib/supabase/server";

// Nouveau téléchargement d'un export déjà produit : lien signé valable 60 s.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/exports/file/[exportId]">) {
  const { exportId } = await ctx.params;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("exports")
    .select("path, kind, format, created_at, assemblies(title)")
    .eq("id", exportId)
    .maybeSingle();
  if (!row) return new Response("Export introuvable.", { status: 404 });
  const title = (row.assemblies as { title: string } | null)?.title ?? "ag";
  const { data } = await supabase.storage.from("exports").createSignedUrl(row.path, 60, {
    download: exportFileName(row.kind as "attendance" | "results", title, row.created_at, row.format),
  });
  if (!data) return new Response("Export indisponible.", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
