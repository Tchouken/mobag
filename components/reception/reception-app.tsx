"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatWeight } from "@/lib/format";
import { buildEntries, PRESENCE_LABELS, searchEntries, type ReceptionSnapshot } from "@/lib/reception/model";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { ReceptionContext, type ReceptionContextValue } from "./context";
import { PersonPanel } from "./person-panel";

const POLL_MS = 5000;
const NEW_PERSON = "new";

const percent = (part: number, total: number) =>
  total > 0
    ? new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(part / total)
    : "—";

// Écran d'accueil (tablette) : recherche instantanée à gauche, fiche de la personne à droite,
// quorum en tête. L'instantané est relu toutes les 5 s et après chaque action (plusieurs postes
// d'accueil travaillent en parallèle ; les conflits sont arbitrés par la base).
export function ReceptionApp({
  initial,
  isBureau,
  backHref,
}: {
  initial: ReceptionSnapshot;
  isBureau: boolean;
  backHref: string;
}) {
  const [supabase] = useState(createClient);
  const [snapshot, setSnapshot] = useState(initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const assemblyId = initial.assembly.id;

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("reception_snapshot", { p_assembly: assemblyId });
    setOffline(Boolean(error));
    if (data) setSnapshot(data as ReceptionSnapshot);
  }, [supabase, assemblyId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const entries = useMemo(() => buildEntries(snapshot), [snapshot]);
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);
  const current = entries.find((e) => e.key === selected);

  const context = useMemo<ReceptionContextValue>(
    () => ({ supabase, assemblyId, isBureau, snapshot, refresh, select: setSelected }),
    [supabase, assemblyId, isBureau, snapshot, refresh],
  );

  const counts = snapshot.quorum.counts;
  const counted = counts.present_represented ?? { weight: 0, heads: 0 };
  const all = counts.all_members ?? { weight: 0, heads: 0 };
  const hasRule = (snapshot.quorum.rule?.conditions.length ?? 0) > 0;

  return (
    <ReceptionContext.Provider value={context}>
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col">
          <Link href={backHref} className="text-muted-foreground text-xs hover:underline">
            ← Préparation
          </Link>
          <h1 className="text-lg font-semibold">Accueil — {snapshot.assembly.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
          <span data-testid="quorum-summary">
            Présents et représentés : <strong>{formatWeight(counted.weight)}</strong> /{" "}
            {formatWeight(all.weight)} voix ({percent(Number(counted.weight), Number(all.weight))}) ·{" "}
            {counted.heads} / {all.heads} membres
          </span>
          {hasRule ? (
            <Badge variant={snapshot.quorum.evaluation.reached ? "success" : "warning"}>
              {snapshot.quorum.evaluation.reached ? "Quorum atteint" : "Quorum non atteint"}
            </Badge>
          ) : (
            <Badge variant="secondary">Pas de quorum requis</Badge>
          )}
          {offline && <Badge variant="warning">Connexion perdue : nouvel essai…</Badge>}
        </div>
      </header>

      <div className="grid flex-1 gap-0 md:grid-cols-[minmax(18rem,2fr)_3fr]">
        <aside className="border-border flex flex-col gap-3 border-b p-4 md:border-r md:border-b-0">
          <label htmlFor="reception-search" className="sr-only">
            Rechercher un membre ou une personne
          </label>
          <Input
            id="reception-search"
            type="search"
            autoFocus
            autoComplete="off"
            className="h-12 text-base"
            placeholder="Nom, référence, représentant…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul
            className="flex flex-col gap-1 overflow-y-auto md:max-h-[calc(100vh-14rem)]"
            aria-label="Résultats"
          >
            {results.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-current={entry.key === selected}
                  onClick={() => setSelected(entry.key)}
                  className={cn(
                    "hover:bg-muted flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left",
                    entry.key === selected && "bg-muted",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {entry.ref && <span className="text-muted-foreground mr-2 text-sm">{entry.ref}</span>}
                      {entry.title}
                    </span>
                    {entry.subtitle && (
                      <span className="text-muted-foreground text-xs">{entry.subtitle}</span>
                    )}
                  </span>
                  <Badge
                    variant={
                      entry.status === "present"
                        ? "success"
                        : entry.status === "represented"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {PRESENCE_LABELS[entry.status] ?? entry.status}
                  </Badge>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="text-muted-foreground px-3 py-2 text-sm">Aucun résultat.</li>
            )}
          </ul>
          <Button type="button" variant="outline" onClick={() => setSelected(NEW_PERSON)}>
            Personne non prévue
          </Button>
        </aside>

        <section className="p-4 md:p-6" aria-live="polite">
          {selected === NEW_PERSON ? (
            <PersonPanel key={NEW_PERSON} memberId={null} attendeeId={null} />
          ) : current ? (
            <PersonPanel key={current.key} memberId={current.memberId} attendeeId={current.attendeeId} />
          ) : (
            <p className="text-muted-foreground">Recherchez une personne pour l&apos;émarger.</p>
          )}
        </section>
      </div>
    </ReceptionContext.Provider>
  );
}
