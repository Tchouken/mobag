"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/assembly/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/format";
import { useAssemblyChannel, useConnectedDevices } from "@/lib/realtime/use-assembly-channel";
import { resolutionState, share, STATE_LABELS, type RegieSnapshot } from "@/lib/regie/model";
import { rpcErrorMessage } from "@/lib/rpc/errors";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { BallotPanel, type BallotActions } from "./ballot-panel";
import { ProjectionLink } from "./projection-link";

const PROGRESS_MS = 2000;

// Régie du bureau : quorum par clé et terminaux en tête, ordre du jour à gauche, pilotage du
// vote de la résolution choisie à droite. L'état est relu à chaque signal temps réel ; la
// participation d'un vote ouvert est relue toutes les 2 s (les votes ne sont pas diffusés).
export function RegieApp({
  initial,
  bodies,
  isBureau,
  isPresident,
  backHref,
}: {
  initial: RegieSnapshot;
  bodies: Record<string, string | null>;
  isBureau: boolean;
  isPresident: boolean;
  backHref: string;
}) {
  const [supabase] = useState(createClient);
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState<string | null>(
    () =>
      initial.resolutions.find((r) => resolutionState(r) === "open")?.id ??
      initial.resolutions.find((r) => resolutionState(r) === "to_vote")?.id ??
      initial.resolutions[0]?.id ??
      null,
  );
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const assemblyId = initial.assembly.id;

  const refresh = useCallback(async () => {
    const { data } = await supabase.rpc("regie_snapshot", { p_assembly: assemblyId });
    if (data) setSnapshot(data as unknown as RegieSnapshot);
  }, [supabase, assemblyId]);

  const live = useAssemblyChannel(supabase, assemblyId, "staff", () => void refresh());
  const connected = useConnectedDevices(supabase, assemblyId);
  const hasOpen = snapshot.open_ballot !== null;

  useEffect(() => {
    if (!hasOpen) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, PROGRESS_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [hasOpen, refresh]);

  const run = (
    action: () => PromiseLike<{ error: { message?: string; code?: string } | null; data?: unknown }>,
    success?: (data: unknown) => string,
  ) =>
    startTransition(async () => {
      setError(undefined);
      setNotice(undefined);
      const { error: rpcError, data } = await action();
      await refresh();
      if (rpcError) setError(rpcErrorMessage(rpcError));
      else if (success) setNotice(success(data));
    });

  const actions: BallotActions = useMemo(
    () => ({
      open: (id, seconds) =>
        run(() =>
          supabase.rpc("open_ballot", {
            p_resolution: id,
            ...(seconds ? { p_duration_seconds: seconds } : {}),
          }),
        ),
      close: (id) => run(() => supabase.rpc("close_ballot", { p_ballot: id })),
      remind: (id) =>
        run(
          () => supabase.rpc("remind_voters", { p_ballot: id }),
          (n) => `Relance envoyée : ${n} personne(s) n'ont pas encore voté.`,
        ),
      timer: (id, seconds) =>
        run(() => supabase.rpc("set_ballot_timer", { p_ballot: id, p_seconds: seconds as number })),
      validate: (id) =>
        run(
          () => supabase.rpc("validate_result", { p_ballot: id }),
          () => "Résultat validé.",
        ),
      cancel: (id, reason) =>
        run(
          () => supabase.rpc("cancel_ballot", { p_ballot: id, p_reason: reason }),
          () => "Vote annulé.",
        ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run ne dépend que de supabase et refresh
    [supabase, refresh],
  );

  const setStatus = (to: "in_session" | "closed", question: string) => {
    if (!window.confirm(question)) return;
    run(() => supabase.rpc("set_assembly_status", { p_assembly: assemblyId, p_to: to }));
  };

  const current = snapshot.resolutions.find((r) => r.id === selected) ?? null;
  const status = snapshot.assembly.status;

  return (
    <>
      <header className="border-border flex flex-col gap-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <Link href={backHref} className="text-muted-foreground text-xs hover:underline">
              ← Préparation
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">Régie — {snapshot.assembly.title}</h1>
              <StatusBadge status={status} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span data-testid="devices">
              Terminaux connectés : <strong>{connected ?? "—"}</strong> · associés{" "}
              {snapshot.devices.associated} · présents {snapshot.devices.present}
            </span>
            <Badge variant="outline" data-testid="live-status">
              {live ? "Temps réel" : "Actualisation toutes les 3 s"}
            </Badge>
            {isBureau && status !== "archived" && (
              <ProjectionLink supabase={supabase} assemblyId={assemblyId} />
            )}
            {isBureau && status === "convened" && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => setStatus("in_session", "Ouvrir la séance ?")}
              >
                Ouvrir la séance
              </Button>
            )}
            {isBureau && status === "in_session" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || hasOpen}
                onClick={() => setStatus("closed", "Clore la séance ? L'assemblée passera en lecture seule.")}
              >
                Clore la séance
              </Button>
            )}
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Quorum par clé de répartition">
          {snapshot.quorum.map((q) => {
            const counted = q.counts.present_represented ?? { weight: 0, heads: 0 };
            const all = q.counts.all_members ?? { weight: 0, heads: 0 };
            const hasRule = (q.rule?.conditions.length ?? 0) > 0;
            return (
              <li
                key={q.weight_key.id}
                className="border-border rounded-md border p-2 text-sm"
                data-testid="quorum-key"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{q.weight_key.label}</span>
                  {hasRule ? (
                    <Badge variant={q.evaluation.reached ? "success" : "warning"}>
                      {q.evaluation.reached ? "Quorum atteint" : "Quorum non atteint"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pas de quorum requis</Badge>
                  )}
                </div>
                <p>
                  {formatWeight(counted.weight)} / {formatWeight(all.weight)} (
                  {share(counted.weight, all.weight)}) · {counted.heads} / {all.heads} membres
                </p>
                <p className="text-muted-foreground text-xs">
                  dont présents {formatWeight(q.counts.present?.weight ?? 0)}, représentés{" "}
                  {formatWeight(q.counts.represented?.weight ?? 0)}
                </p>
              </li>
            );
          })}
        </ul>
      </header>

      <div className="grid flex-1 md:grid-cols-[minmax(16rem,1fr)_2fr]">
        <nav className="border-border border-b p-3 md:border-r md:border-b-0" aria-label="Ordre du jour">
          <ol className="flex flex-col gap-1">
            {snapshot.resolutions.map((r) => {
              const state = resolutionState(r);
              return (
                <li key={r.id} className={r.parent_id ? "ml-4" : ""}>
                  <button
                    type="button"
                    aria-current={r.id === selected}
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      "hover:bg-muted flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left",
                      r.id === selected && "bg-muted",
                    )}
                  >
                    <span>
                      <span className="text-muted-foreground mr-2">{r.number}</span>
                      {r.title}
                    </span>
                    <Badge
                      variant={state === "open" ? "warning" : state === "validated" ? "success" : "outline"}
                    >
                      {STATE_LABELS[state]}
                    </Badge>
                  </button>
                </li>
              );
            })}
            {snapshot.resolutions.length === 0 && (
              <li className="text-muted-foreground px-3 text-sm">L&apos;ordre du jour est vide.</li>
            )}
          </ol>
        </nav>
        <section className="flex flex-col gap-4 p-4 md:p-6">
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          {notice && (
            <Alert variant="success" role="status">
              {notice}
            </Alert>
          )}
          {current ? (
            <BallotPanel
              key={current.id}
              resolution={current}
              bodyHtml={bodies[current.id] ?? null}
              progress={snapshot.open_ballot}
              inSession={status === "in_session"}
              otherOpen={hasOpen && resolutionState(current) !== "open"}
              isBureau={isBureau}
              isPresident={isPresident}
              pending={pending}
              now={now}
              actions={actions}
            />
          ) : (
            <p className="text-muted-foreground">Choisissez une résolution.</p>
          )}
          {!isBureau && (
            <p className="text-muted-foreground text-sm">
              Lecture seule : le pilotage des votes est réservé au bureau de séance.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
