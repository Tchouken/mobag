"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { parseFile, submitImport } from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/members/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatWeight } from "@/lib/format";
import {
  buildImportRows,
  FIELDS,
  guessMapping,
  hasNameColumn,
  type Mapping,
  type WeightKeyRef,
} from "@/lib/import/mapping";
import {
  fieldLabel,
  IMPORT_MODES,
  issueMessage,
  type ImportReport,
  type ReportIssue,
} from "@/lib/import/report";
import type { ParsedSheet } from "@/lib/import/table";

type Mode = ImportReport["mode"];
type Source = { filename: string; sha256: string };

type Props = { orgId: string; assemblyId: string; keys: WeightKeyRef[]; hasMembers: boolean };

function Steps({ current }: { current: number }) {
  const labels = ["Fichier", "Colonnes", "Vérification", "Import"];
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Étapes de l'import">
      {labels.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined}>
          <Badge variant={i === current ? "default" : i < current ? "secondary" : "outline"}>
            {i + 1}. {label}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function ColumnSelect({
  id,
  value,
  onChange,
  sheet,
}: {
  id: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  sheet: ParsedSheet;
}) {
  const sample = (col: number) => sheet.rows.find((r) => r.cells[col])?.cells[col] ?? "";
  return (
    <Select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">— Non importé —</option>
      {sheet.headers.map((h, i) => (
        <option key={i} value={i}>
          {h}
          {sample(i) ? ` (ex. : ${sample(i).slice(0, 30)})` : ""}
        </option>
      ))}
    </Select>
  );
}

function IssuesTable({
  issues,
  keyLabels,
  total,
}: {
  issues: ReportIssue[];
  keyLabels: Record<string, string>;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ligne</TableHead>
            <TableHead>Champ</TableHead>
            <TableHead>Problème</TableHead>
            <TableHead>Valeur</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue, i) => (
            <TableRow key={i}>
              <TableCell className="tabular-nums">{issue.line ?? "—"}</TableCell>
              <TableCell>{fieldLabel(issue.field, keyLabels)}</TableCell>
              <TableCell>
                {issueMessage(issue.code)}
                {issue.code === "total_mismatch" &&
                  ` Déclaré : ${formatWeight(issue.declared)}, importé : ${formatWeight(issue.projected)} (écart ${formatWeight(issue.difference)}).`}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {issue.value === undefined || issue.value === null ? "" : String(issue.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {total > issues.length && (
        <p className="text-muted-foreground text-sm">
          {issues.length} premières lignes affichées sur {total}.
        </p>
      )}
    </div>
  );
}

export function ImportWizard({ orgId, assemblyId, keys, hasMembers }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<Mode>(hasMembers ? "upsert" : "append");
  const [sheet, setSheet] = useState<ParsedSheet>();
  const [source, setSource] = useState<Source>();
  const [mapping, setMapping] = useState<Mapping>();
  const [report, setReport] = useState<ImportReport>();
  const [done, setDone] = useState<ImportReport>();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const keyLabels = Object.fromEntries(keys.map((k) => [k.code, k.label]));
  const base = `/orgs/${orgId}/assemblies/${assemblyId}/members`;

  const rows = useMemo(() => (sheet && mapping ? buildImportRows(sheet, mapping) : []), [sheet, mapping]);
  const step = done ? 3 : report ? 2 : sheet ? 1 : 0;

  const upload = (formData: FormData) =>
    startTransition(async () => {
      setError(undefined);
      const result = await parseFile(formData);
      if (!result.ok) return setError(result.error);
      setSheet(result.sheet);
      setSource(result.source);
      setMapping(guessMapping(result.sheet.headers, keys));
    });

  const submit = (dryRun: boolean) =>
    startTransition(async () => {
      setError(undefined);
      const result = await submitImport(orgId, assemblyId, rows, mode, source, dryRun);
      if (!result.ok) return setError(result.error);
      if (dryRun) setReport(result.report);
      else if (result.report.ok) setDone(result.report);
      else setReport(result.report);
    });

  const reset = () => {
    setSheet(undefined);
    setSource(undefined);
    setMapping(undefined);
    setReport(undefined);
    setDone(undefined);
    setConfirmReplace(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <Steps current={step} />
      {error && <Alert variant="destructive">{error}</Alert>}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fichier des participants</CardTitle>
            <CardDescription>
              Fichier .xlsx ou .csv (séparateur « ; » ou « , »), une ligne d&apos;en-tête puis une ligne par
              membre, avec une colonne de voix par clé de répartition. 20 000 lignes et 5 Mo maximum.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={upload} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-file">Fichier</Label>
                <Input id="import-file" name="file" type="file" required accept=".csv,.xlsx,.txt" />
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Mode d&apos;import</legend>
                {(Object.keys(IMPORT_MODES) as Mode[]).map((m) => (
                  <label key={m} className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{IMPORT_MODES[m].label}</span>
                      <span className="text-muted-foreground block text-sm">{IMPORT_MODES[m].hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <Button type="submit" disabled={pending}>
                  {pending ? "Lecture…" : "Lire le fichier"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 1 && sheet && mapping && (
        <Card>
          <CardHeader>
            <CardTitle>Correspondance des colonnes</CardTitle>
            <CardDescription>
              {source?.filename} · {sheet.rows.length.toLocaleString("fr-FR")} lignes
              {sheet.sheetName && ` · onglet « ${sheet.sheetName} »`}. Les colonnes ont été proposées
              d&apos;après les en-têtes : vérifiez-les.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.id} className="flex flex-col gap-1">
                  <Label htmlFor={`map-${f.id}`}>{f.label}</Label>
                  <ColumnSelect
                    id={`map-${f.id}`}
                    sheet={sheet}
                    value={mapping.fields[f.id]}
                    onChange={(v) => setMapping({ ...mapping, fields: { ...mapping.fields, [f.id]: v } })}
                  />
                  {f.hint && <p className="text-muted-foreground text-xs">{f.hint}</p>}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="font-medium">Voix par clé de répartition</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {keys.map((k) => (
                  <div key={k.code} className="flex flex-col gap-1">
                    <Label htmlFor={`map-weight-${k.code}`}>{k.label}</Label>
                    <ColumnSelect
                      id={`map-weight-${k.code}`}
                      sheet={sheet}
                      value={mapping.weights[k.code]}
                      onChange={(v) =>
                        setMapping({ ...mapping, weights: { ...mapping.weights, [k.code]: v } })
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-sm">
                Une clé sans colonne vaut 0 voix pour tous les membres.
              </p>
            </div>
            {!hasNameColumn(mapping) && (
              <Alert variant="destructive">
                Associez au moins une colonne de nom, de raison sociale ou de nom complet.
              </Alert>
            )}
            <div className="flex gap-2">
              <Button disabled={pending || !hasNameColumn(mapping)} onClick={() => submit(true)}>
                {pending ? "Vérification…" : "Vérifier le fichier"}
              </Button>
              <Button variant="outline" onClick={reset}>
                Changer de fichier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && report && (
        <Card>
          <CardHeader>
            <CardTitle>{report.ok ? "Fichier prêt à importer" : "Le fichier contient des erreurs"}</CardTitle>
            <CardDescription>
              {report.rows.toLocaleString("fr-FR")} lignes · {report.error_count} erreur(s) ·{" "}
              {report.warning_count} avertissement(s) · mode « {IMPORT_MODES[report.mode].label} ». Rien
              n&apos;a encore été enregistré.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clé</TableHead>
                  <TableHead className="text-right">Membres concernés</TableHead>
                  <TableHead className="text-right">Total après import</TableHead>
                  <TableHead className="text-right">Total déclaré</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.totals.map((t) => (
                  <TableRow key={t.code}>
                    <TableCell>{t.label}</TableCell>
                    <TableCell className="text-right">{t.members_with_weight}</TableCell>
                    <TableCell className="text-right">{formatWeight(t.projected)}</TableCell>
                    <TableCell className="text-right">{formatWeight(t.declared)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {report.error_count > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-destructive font-medium">Erreurs à corriger dans le fichier</h3>
                <IssuesTable issues={report.errors} keyLabels={keyLabels} total={report.error_count} />
              </section>
            )}
            {report.warning_count > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">Avertissements (n&apos;empêchent pas l&apos;import)</h3>
                <IssuesTable issues={report.warnings} keyLabels={keyLabels} total={report.warning_count} />
              </section>
            )}

            {report.ok && mode === "replace" && (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmReplace}
                  onChange={(e) => setConfirmReplace(e.target.checked)}
                />
                <span>Je confirme le remplacement de tous les membres actuels de l&apos;assemblée.</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {report.ok && (
                <Button
                  disabled={pending || (mode === "replace" && !confirmReplace)}
                  onClick={() => submit(false)}
                >
                  {pending ? "Import…" : `Importer ${report.rows.toLocaleString("fr-FR")} ligne(s)`}
                </Button>
              )}
              <Button variant="outline" onClick={() => setReport(undefined)}>
                Revoir les colonnes
              </Button>
              <Button variant="ghost" onClick={reset}>
                Changer de fichier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && done && (
        <Alert variant="success" className="flex flex-col gap-3">
          <p>
            Import terminé : {done.inserted} membre(s) ajouté(s), {done.updated} mis à jour. L&apos;opération
            est tracée dans le journal d&apos;audit.
          </p>
          <div>
            <Link href={base} className={buttonVariants()}>
              Voir les participants
            </Link>
          </div>
        </Alert>
      )}
    </div>
  );
}
