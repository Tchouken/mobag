import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { CONTENT_TYPES, isExportRequest, type ExportKind } from "@/lib/exports/formats";
import type { AttendanceData, ResultsData } from "@/lib/exports/model";
import { attendancePdf, resultsPdf } from "@/lib/exports/pdf";
import { attendanceXlsx, resultsCsv, resultsXlsx } from "@/lib/exports/sheets";
import { exportFileName } from "@/lib/exports/text";
import { rpcErrorCode } from "@/lib/rpc/errors";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Génère un export, le dépose (bucket privé « exports »), l'enregistre avec son empreinte
// SHA-256 (journal et audit), puis le renvoie en téléchargement. Droits vérifiés par la base.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/exports/[assemblyId]/[kind]">) {
  const { assemblyId, kind } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format");
  if (!UUID.test(assemblyId) || !isExportRequest(kind, format)) {
    return new Response("Export inconnu.", { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return new Response("Connexion requise.", { status: 401 });

  let bytes: Uint8Array;
  let title: string;
  let generatedAt: string;
  if ((kind as ExportKind) === "attendance") {
    const { data, error } = await supabase.rpc("export_attendance_data", { p_assembly: assemblyId });
    if (error || !data) return notFound(error);
    const attendance = data as unknown as AttendanceData;
    const signatures = await loadSignatures(supabase, attendance);
    bytes =
      format === "pdf"
        ? await attendancePdf(attendance, signatures)
        : await attendanceXlsx(attendance, signatures);
    ({ title } = attendance.assembly);
    generatedAt = attendance.generated_at;
  } else {
    const { data, error } = await supabase.rpc("export_results_data", { p_assembly: assemblyId });
    if (error || !data) return notFound(error);
    const results = data as unknown as ResultsData;
    bytes =
      format === "pdf"
        ? await resultsPdf(results)
        : format === "xlsx"
          ? await resultsXlsx(results)
          : resultsCsv(results);
    ({ title } = results.assembly);
    generatedAt = results.generated_at;
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `${assemblyId}/${randomUUID()}.${format}`;
  const { error: uploadError } = await supabase.storage
    .from("exports")
    .upload(path, bytes, { contentType: CONTENT_TYPES[format].split(";")[0] });
  if (uploadError) return new Response("Dépôt de l'export impossible. Réessayez.", { status: 500 });
  const { data: exportId, error: recordError } = await supabase.rpc("record_export", {
    p_assembly: assemblyId,
    p_kind: kind,
    p_format: format,
    p_path: path,
    p_sha256: sha256,
    p_size: bytes.byteLength,
  });
  if (recordError) return new Response("Enregistrement de l'export impossible. Réessayez.", { status: 500 });

  const fileName = exportFileName(kind as ExportKind, title, generatedAt, format);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
      "X-Export-Id": String(exportId),
      "X-Export-Sha256": sha256,
    },
  });
}

function notFound(error: { code?: string; message?: string } | null) {
  return rpcErrorCode(error) === "not_found" || !error
    ? new Response("Assemblée introuvable.", { status: 404 })
    : new Response("Export impossible.", { status: 500 });
}

// Signatures des personnes émargées, lues sous les droits de l'utilisateur (16 à la fois).
async function loadSignatures(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: AttendanceData,
): Promise<Map<string, Uint8Array>> {
  const paths = [
    ...new Set(
      [
        ...data.members.map((m) => m.attendee?.signature_path),
        ...data.others.map((o) => o.signature_path),
      ].filter((p): p is string => Boolean(p)),
    ),
  ];
  const result = new Map<string, Uint8Array>();
  for (let i = 0; i < paths.length; i += 16) {
    await Promise.all(
      paths.slice(i, i + 16).map(async (path) => {
        const { data } = await supabase.storage.from("signatures").download(path);
        if (data) result.set(path, new Uint8Array(await data.arrayBuffer()));
      }),
    );
  }
  return result;
}
