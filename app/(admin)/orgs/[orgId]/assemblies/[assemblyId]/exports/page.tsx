import { ExportButton } from "@/components/exports/export-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSEMBLY_STATUS_LABELS } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { isBureauMember } from "@/lib/auth/bureau";
import { EXPORT_FORMATS, KIND_LABELS, type ExportKind } from "@/lib/exports/formats";
import { formatDateTime } from "@/lib/labels";

const FORMAT_LABELS = { pdf: "PDF", xlsx: "Excel", csv: "CSV" } as const;

export default async function ExportsPage({
  params,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/exports">) {
  const { orgId, assemblyId } = await params;
  const ctx = await requireAssembly(orgId, assemblyId);
  const allowed = ctx.canManage || (await isBureauMember(ctx));
  if (!allowed) {
    return <Alert>Les exports sont réservés à la préparation et au bureau de séance.</Alert>;
  }
  const { data: history } = await ctx.supabase
    .from("exports")
    .select("id, kind, format, sha256, size_bytes, assembly_status, created_at, profiles:created_by(email)")
    .eq("assembly_id", ctx.assembly.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Produire un document</CardTitle>
          <CardDescription>
            Chaque document est conservé avec son empreinte SHA-256 et consigné au journal d&apos;audit. La
            feuille de présence comprend les signatures recueillies à l&apos;accueil ; les résultats indiquent
            les votes validés, provisoires et annulés.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(Object.keys(EXPORT_FORMATS) as ExportKind[]).map((kind) => (
            <div key={kind} className="flex flex-col gap-2">
              <h3 className="font-medium">{KIND_LABELS[kind]}</h3>
              <div className="flex flex-wrap gap-3">
                {EXPORT_FORMATS[kind].map((format) => (
                  <ExportButton
                    key={format}
                    href={`/api/exports/${ctx.assembly.id}/${kind}?format=${format}`}
                    label={`${KIND_LABELS[kind]} — ${FORMAT_LABELS[format]}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents produits</CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Statut de l&apos;AG</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDateTime(e.created_at)}</TableCell>
                    <TableCell>
                      {KIND_LABELS[e.kind as ExportKind]} (
                      {FORMAT_LABELS[e.format as keyof typeof FORMAT_LABELS]},{" "}
                      {Math.max(1, Math.round(e.size_bytes / 1024))} Ko)
                    </TableCell>
                    <TableCell>{ASSEMBLY_STATUS_LABELS[e.assembly_status]}</TableCell>
                    <TableCell>{(e.profiles as { email: string | null } | null)?.email ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs" title={e.sha256}>
                      {e.sha256.slice(0, 16)}…
                    </TableCell>
                    <TableCell>
                      <a className="text-sm underline" href={`/api/exports/file/${e.id}`}>
                        Télécharger
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Aucun document produit pour l&apos;instant.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
