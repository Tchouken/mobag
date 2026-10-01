import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isEditableStatus } from "@/lib/assembly-labels";
import { requireAssembly } from "@/lib/auth/assembly";
import { formatWeight, sanitizeSearch } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function MembersPage({
  params,
  searchParams,
}: PageProps<"/orgs/[orgId]/assemblies/[assemblyId]/members">) {
  const { orgId, assemblyId } = await params;
  const sp = await searchParams;
  const q = sanitizeSearch(typeof sp.q === "string" ? sp.q : undefined);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const { supabase, org, assembly, canManage } = await requireAssembly(orgId, assemblyId);
  const editable = canManage && isEditableStatus(assembly.status);
  const base = `/orgs/${org.id}/assemblies/${assembly.id}/members`;

  let query = supabase
    .from("members")
    .select(
      "id, kind, display_name, external_ref, email, representative_name, is_proxy_ineligible, member_weights(weight_key_id, weight)",
      {
        count: "exact",
      },
    )
    .eq("assembly_id", assembly.id)
    .order("external_ref", { nullsFirst: false })
    .order("display_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`display_name.ilike.*${q}*,external_ref.ilike.*${q}*,email.ilike.*${q}*`);

  const [{ data: members, count, error }, { data: totals }] = await Promise.all([
    query,
    supabase.from("weight_key_totals").select("*").eq("assembly_id", assembly.id).order("position"),
  ]);
  if (error) throw error;
  const keys = totals ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageHref = (p: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Voix par clé de répartition</CardTitle>
          {editable && (
            <div className="flex gap-2">
              <Link href={`${base}/import`} className={buttonVariants()}>
                Importer un fichier
              </Link>
              <Link href={`${base}/new`} className={buttonVariants({ variant: "outline" })}>
                Ajouter un membre
              </Link>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clé</TableHead>
                <TableHead className="text-right">Membres concernés</TableHead>
                <TableHead className="text-right">Total des voix</TableHead>
                <TableHead className="text-right">Total déclaré</TableHead>
                <TableHead>Contrôle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => {
                const mismatch =
                  k.total_declared !== null && Number(k.total_declared) !== Number(k.total_imported);
                return (
                  <TableRow key={k.weight_key_id}>
                    <TableCell>
                      {k.label}
                      {k.is_primary && " (principale)"}
                    </TableCell>
                    <TableCell className="text-right">{k.members_with_weight}</TableCell>
                    <TableCell className="text-right">{formatWeight(k.total_imported)}</TableCell>
                    <TableCell className="text-right">{formatWeight(k.total_declared)}</TableCell>
                    <TableCell>
                      {k.total_declared === null ? (
                        <span className="text-muted-foreground text-sm">Pas de total déclaré</span>
                      ) : mismatch ? (
                        <Badge variant="warning">
                          Écart de {formatWeight(Number(k.total_imported) - Number(k.total_declared))}
                        </Badge>
                      ) : (
                        <Badge variant="success">Conforme</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Membres ({count ?? 0})</CardTitle>
          <form className="flex w-full max-w-sm gap-2" role="search">
            <Input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Nom, référence ou e-mail"
              aria-label="Rechercher un membre"
            />
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Rechercher
            </button>
          </form>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(members ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {q
                ? "Aucun membre ne correspond à la recherche."
                : "Aucun membre. Importez un fichier ou ajoutez-les un par un."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Réf.</TableHead>
                  <TableHead>Membre</TableHead>
                  {keys.map((k) => (
                    <TableHead key={k.weight_key_id} className="text-right">
                      {k.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const byKey = new Map(m.member_weights.map((w) => [w.weight_key_id, w.weight]));
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-sm">{m.external_ref ?? "—"}</TableCell>
                      <TableCell>
                        <Link href={`${base}/${m.id}`} className="font-medium hover:underline">
                          {m.display_name}
                        </Link>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                          {m.kind === "legal_entity" && (
                            <span>
                              Personne morale
                              {m.representative_name && ` — représentée par ${m.representative_name}`}
                            </span>
                          )}
                          {m.email && <span>{m.email}</span>}
                          {m.is_proxy_ineligible && <Badge variant="outline">Non éligible mandataire</Badge>}
                        </div>
                      </TableCell>
                      {keys.map((k) => (
                        <TableCell key={k.weight_key_id} className="text-right tabular-nums">
                          {formatWeight(byKey.get(k.weight_key_id ?? "") ?? 0)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
              <Link
                aria-disabled={page <= 1}
                href={pageHref(page - 1)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  page <= 1 && "pointer-events-none opacity-50",
                )}
              >
                Précédent
              </Link>
              <span>
                Page {page} sur {pages}
              </span>
              <Link
                aria-disabled={page >= pages}
                href={pageHref(page + 1)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  page >= pages && "pointer-events-none opacity-50",
                )}
              >
                Suivant
              </Link>
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
