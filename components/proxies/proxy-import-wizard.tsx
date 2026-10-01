"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { parseFile } from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/members/actions";
import {
  submitProxyImport,
  type ProxyImportReport,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/proxies/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildProxyRows,
  guessProxyMapping,
  PROXY_FIELDS,
  type ProxyMapping,
} from "@/lib/import/proxy-mapping";
import type { ParsedSheet } from "@/lib/import/table";
import { violationMessage } from "@/lib/proxies";
import { rpcErrorMessage } from "@/lib/rpc/errors";

export function ProxyImportWizard({ orgId, assemblyId }: { orgId: string; assemblyId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [sheet, setSheet] = useState<ParsedSheet>();
  const [source, setSource] = useState<{ filename: string; sha256: string }>();
  const [mapping, setMapping] = useState<ProxyMapping>({});
  const [report, setReport] = useState<ProxyImportReport>();
  const [done, setDone] = useState<ProxyImportReport>();
  const rows = useMemo(() => (sheet ? buildProxyRows(sheet, mapping) : []), [sheet, mapping]);

  const upload = (formData: FormData) =>
    startTransition(async () => {
      setError(undefined);
      const result = await parseFile(formData);
      if (!result.ok) return setError(result.error);
      setSheet(result.sheet);
      setSource(result.source);
      setMapping(guessProxyMapping(result.sheet.headers));
    });

  const submit = (dryRun: boolean) =>
    startTransition(async () => {
      setError(undefined);
      const result = await submitProxyImport(orgId, assemblyId, rows, source!, dryRun);
      if (!result.ok) return setError(result.error);
      if (!dryRun && result.report.ok) setDone(result.report);
      else setReport(result.report);
    });

  const sample = (col: number) => sheet?.rows.find((r) => r.cells[col])?.cells[col] ?? "";

  if (done) {
    return (
      <Alert variant="success" className="flex flex-col gap-3">
        <p>
          Import terminé : {done.created} pouvoir(s) enregistré(s), chacun tracé dans le journal d&apos;audit.
        </p>
        <div>
          <Link href={`/orgs/${orgId}/assemblies/${assemblyId}/proxies`} className={buttonVariants()}>
            Voir les pouvoirs
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {!sheet && (
        <Card>
          <CardHeader>
            <CardTitle>Fichier des pouvoirs</CardTitle>
            <CardDescription>
              Une ligne par pouvoir : référence du mandant, puis référence du mandataire s&apos;il est membre,
              ou son nom s&apos;il ne l&apos;est pas, et le type (nominatif ou en blanc). Toutes les règles
              sont vérifiées ligne par ligne, dans l&apos;ordre du fichier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={upload} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="proxy-file">Fichier (.xlsx ou .csv)</Label>
                <Input id="proxy-file" name="file" type="file" required accept=".csv,.xlsx,.txt" />
              </div>
              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? "Lecture…" : "Lire le fichier"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {sheet && !report && (
        <Card>
          <CardHeader>
            <CardTitle>Correspondance des colonnes</CardTitle>
            <CardDescription>
              {source?.filename} · {sheet.rows.length} ligne(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {PROXY_FIELDS.map((f) => (
                <div key={f.id} className="flex flex-col gap-1">
                  <Label htmlFor={`pmap-${f.id}`}>{f.label}</Label>
                  <Select
                    id={`pmap-${f.id}`}
                    value={mapping[f.id] ?? ""}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        [f.id]: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">— Non importé —</option>
                    {sheet.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                        {sample(i) ? ` (ex. : ${sample(i).slice(0, 30)})` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button disabled={pending || mapping.grantor_ref == null} onClick={() => submit(true)}>
                {pending ? "Vérification…" : "Vérifier le fichier"}
              </Button>
              <Button variant="outline" onClick={() => setSheet(undefined)}>
                Changer de fichier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>{report.ok ? "Fichier prêt à importer" : "Le fichier contient des erreurs"}</CardTitle>
            <CardDescription>
              {report.rows} ligne(s) ·{" "}
              {report.ok ? `${report.valid ?? report.created} valide(s)` : `${report.error_count} refusée(s)`}
              . Rien n&apos;a encore été enregistré.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {report.error_count > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Mandant</TableHead>
                    <TableHead>Problème</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">{e.line}</TableCell>
                      <TableCell className="font-mono text-sm">{e.grantor_ref ?? "—"}</TableCell>
                      <TableCell>
                        {rpcErrorMessage({ code: "P0001", message: e.code })}
                        {e.detail && (
                          <ul className="text-muted-foreground list-inside list-disc text-sm">
                            {e.detail.map((v, j) => (
                              <li key={j}>{violationMessage(v)}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-wrap gap-2">
              {report.ok && (
                <Button disabled={pending} onClick={() => submit(false)}>
                  {pending ? "Import…" : `Importer ${report.valid ?? report.rows} pouvoir(s)`}
                </Button>
              )}
              <Button variant="outline" onClick={() => setReport(undefined)}>
                Revoir les colonnes
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setReport(undefined);
                  setSheet(undefined);
                }}
              >
                Changer de fichier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
