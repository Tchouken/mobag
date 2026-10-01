import Link from "next/link";
import { ProxyRowActions } from "@/components/proxies/proxy-row-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAssembly } from "@/lib/auth/assembly";
import { proxyRulesSchema } from "@/lib/domain/rules";
import { formatWeight } from "@/lib/format";
import { formatDateTime } from "@/lib/labels";
import { PROXY_STATUS_LABELS, PROXY_TYPE_LABELS, REVOKED_KIND_LABELS } from "@/lib/proxies";
import { cn } from "@/lib/utils";

type Overview = {
  total_weight: number;
  pending_blank: number;
  active: number;
  holders: {
    attendee_id: string;
    full_name: string;
    status: string;
    proxy_count: number;
    held_weight: number;
    compliant: boolean;
  }[];
};

const BLANK_LABELS = {
  president: "attribués au président de séance",
  board_recommendation: "votés selon l'avis du conseil par le président",
  none: "non admis",
} as const;

export default async function ProxiesPage({
  params,
  searchParams,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/proxies">) {
  const { orgId, assemblyId } = await params;
  const showAll = (await searchParams).show === "all";
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const editable = canManage && ["draft", "convened", "in_session"].includes(assembly.status);
  const base = `/orgs/${org.id}/assemblies/${assembly.id}/proxies`;

  let query = supabase
    .from("proxies")
    .select(
      "id, type, status, document_path, derogation_reason, created_at, revoked_kind, revoked_reason, members(display_name, external_ref), attendees(full_name)",
    )
    .eq("assembly_id", assembly.id)
    .order("created_at", { ascending: false });
  if (!showAll) query = query.in("status", ["active", "pending"]);
  const [{ data: proxies, error }, { data: overviewData }] = await Promise.all([
    query,
    supabase.rpc("proxy_overview", { p_assembly: assembly.id }),
  ]);
  if (error) throw error;
  const overview = overviewData as unknown as Overview;
  const rules = proxyRulesSchema.parse(assembly.proxy_rules);
  const caps = [
    rules.max_count !== null && `${rules.max_count} pouvoir(s) au plus`,
    rules.max_share !== null &&
      `${rules.max_share.num}/${rules.max_share.den} des voix au plus (pouvoirs inclus)`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Pouvoirs</CardTitle>
            <CardDescription>
              {overview.active} actif(s), {overview.pending_blank} en blanc en attente du président. Plafond
              par mandataire : {caps.length ? caps.join(rules.combine === "or" ? " ou " : " et ") : "aucun"}.
              Pouvoirs en blanc {BLANK_LABELS[rules.blank_to]}.
            </CardDescription>
          </div>
          {editable && (
            <div className="flex gap-2">
              <Link href={`${base}/new`} className={buttonVariants()}>
                Saisir des pouvoirs
              </Link>
              <Link href={`${base}/import`} className={buttonVariants({ variant: "outline" })}>
                Importer
              </Link>
            </div>
          )}
        </CardHeader>
        {overview.holders.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mandataire</TableHead>
                  <TableHead className="text-right">Pouvoirs</TableHead>
                  <TableHead className="text-right">Voix détenues</TableHead>
                  <TableHead className="text-right">Part</TableHead>
                  <TableHead>Plafonds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.holders.map((h) => (
                  <TableRow key={h.attendee_id}>
                    <TableCell>{h.full_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.proxy_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatWeight(h.held_weight)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {overview.total_weight > 0
                        ? `${((h.held_weight / overview.total_weight) * 100).toFixed(1).replace(".", ",")} %`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {h.compliant ? (
                        <Badge variant="success">Conforme</Badge>
                      ) : (
                        <Badge variant="warning">Dérogation</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>
            {showAll ? "Tous les pouvoirs" : "Pouvoirs en vigueur"} ({proxies.length})
          </CardTitle>
          <Link
            href={showAll ? base : `${base}?show=all`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            {showAll ? "Masquer les pouvoirs révoqués" : "Afficher aussi les pouvoirs révoqués"}
          </Link>
        </CardHeader>
        <CardContent>
          {proxies.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun pouvoir.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mandant</TableHead>
                  <TableHead>Mandataire</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {proxies.map((p) => {
                  const live = p.status !== "revoked";
                  const grantor = `${p.members?.external_ref ? `${p.members.external_ref} — ` : ""}${p.members?.display_name ?? ""}`;
                  return (
                    <TableRow key={p.id} className={live ? undefined : "text-muted-foreground"}>
                      <TableCell>{grantor}</TableCell>
                      <TableCell>{p.attendees?.full_name ?? "Président (à désigner)"}</TableCell>
                      <TableCell>
                        {PROXY_TYPE_LABELS[p.type]}
                        {p.derogation_reason && (
                          <Badge variant="warning" className="ml-2" title={p.derogation_reason}>
                            Dérogation
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {PROXY_STATUS_LABELS[p.status]}
                        {p.revoked_kind && ` (${REVOKED_KIND_LABELS[p.revoked_kind] ?? p.revoked_kind})`}
                        <div className="text-muted-foreground text-xs">{formatDateTime(p.created_at)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <ProxyRowActions
                          orgId={org.id}
                          assemblyId={assembly.id}
                          proxyId={p.id}
                          grantorLabel={grantor}
                          documentPath={p.document_path}
                          live={live}
                          editable={editable}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
