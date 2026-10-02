"use client";

import { useEffect, useState } from "react";
import { formatWeight } from "@/lib/format";
import { PROJECTION_OUTCOMES, readProjectionToken, resultBars, type ProjectionState } from "@/lib/projection";
import { countdown, share } from "@/lib/regie/model";
import { createClient } from "@/lib/supabase/browser";

const POLL_MS = 1500;

// Couleurs des décomptes : palette catégorielle validée (contraste, daltonismes) sur la surface
// sombre de l'écran ; chaque barre porte aussi son libellé et sa valeur.
const SERIES = { for: "#3987e5", against: "#d95926", abstain: "#199e70" } as const;
const LABELS = { for: "Pour", against: "Contre", abstain: "Abstention" } as const;

type Load = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; state: ProjectionState };

// Écran public de la salle (SPEC §5.11) : lecture seule, sans session. Le jeton est lu dans le
// fragment de l'URL ; l'état public est relu toutes les 1,5 s.
export function ProjectionScreen() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const token = readProjectionToken(window.location.hash);
    const supabase = createClient();
    let stopped = false;
    const poll = async () => {
      if (!token) {
        setLoad({ kind: "invalid" });
        return;
      }
      const { data, error } = await supabase.rpc("projection_state", { p_token: token });
      if (stopped) return;
      setOffline(Boolean(error));
      if (error) return;
      setLoad(data ? { kind: "ready", state: data as unknown as ProjectionState } : { kind: "invalid" });
    };
    const first = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => void poll(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  if (load.kind === "loading") return <Shell>{null}</Shell>;
  if (load.kind === "invalid") {
    return (
      <Shell>
        <p className="m-auto text-center text-3xl">Lien de projection invalide ou révoqué.</p>
      </Shell>
    );
  }

  const { state } = load;
  const counted = state.quorum.counts.present_represented;
  const all = state.quorum.counts.all_members;
  const remaining = state.current ? countdown(state.current.closes_at, now) : null;

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <h1 className="text-4xl font-semibold lg:text-5xl">{state.assembly.title}</h1>
        <div className="flex flex-col items-end gap-1 text-right" data-testid="projection-quorum">
          {state.quorum.has_rule && (
            <p className="text-3xl font-semibold">
              {state.quorum.reached ? "✓ Quorum atteint" : "Quorum non atteint"}
            </p>
          )}
          <p className="text-2xl text-[#c3c2b7]">
            {counted.heads} / {all.heads} membres présents ou représentés ·{" "}
            {share(counted.weight, all.weight)} des {state.quorum.weight_key.toLowerCase()}
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-10">
        {state.current ? (
          <section className="flex flex-col gap-8" aria-label="Vote en cours">
            <div className="flex flex-col gap-2">
              <p className="text-3xl text-[#c3c2b7]">Vote en cours — résolution {state.current.number}</p>
              <h2 className="text-5xl leading-tight font-semibold lg:text-6xl">{state.current.title}</h2>
            </div>
            {remaining && (
              <p className="text-7xl font-semibold tabular-nums" data-testid="projection-countdown">
                {remaining}
              </p>
            )}
            <div className="flex flex-col gap-3" data-testid="projection-participation">
              <p className="text-3xl">
                Participation :{" "}
                <strong>{share(state.current.voted.weight, state.current.eligible.weight)}</strong> des voix ·{" "}
                {state.current.voted.heads} / {state.current.eligible.heads} votants
              </p>
              <div className="h-6 w-full rounded-sm bg-[#2c2c2a]">
                <div
                  className="h-full rounded-r-[4px] bg-[#3987e5] transition-all duration-500"
                  style={{
                    width: `${Number(state.current.eligible.weight) > 0 ? (Number(state.current.voted.weight) / Number(state.current.eligible.weight)) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </section>
        ) : state.result ? (
          <ResultChart result={state.result} />
        ) : (
          <p className="text-center text-4xl text-[#c3c2b7]">
            {state.assembly.status === "closed" ? "La séance est close." : "En attente du prochain vote"}
          </p>
        )}
      </main>

      <footer className="flex items-center justify-between text-lg text-[#c3c2b7]">
        <span>{offline ? "Connexion perdue : nouvel essai…" : ""}</span>
        {!fullscreen && (
          <button
            type="button"
            className="rounded-md border border-[#c3c2b7] px-4 py-2"
            onClick={() => void document.documentElement.requestFullscreen?.()}
          >
            Plein écran
          </button>
        )}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col gap-10 bg-[#1a1a19] p-10 text-white lg:p-16"
      style={{ colorScheme: "dark" }}
    >
      {children}
    </div>
  );
}

function ResultChart({ result }: { result: NonNullable<ProjectionState["result"]> }) {
  const bars = resultBars(result.tallies);
  return (
    <section className="flex flex-col gap-8" aria-label="Résultat validé">
      <div className="flex flex-col gap-2">
        <p className="text-3xl text-[#c3c2b7]">Résultat — résolution {result.number}</p>
        <h2 className="text-5xl leading-tight font-semibold">{result.title}</h2>
        <p className="mt-4 text-6xl font-bold uppercase" data-testid="projection-outcome">
          {PROJECTION_OUTCOMES[result.outcome]}
        </p>
      </div>
      <div className="flex flex-col gap-[2px]" aria-hidden="true">
        {bars.map((b) => (
          <div key={b.key} className="grid grid-cols-[12rem_1fr_16rem] items-center gap-6 py-2 text-3xl">
            <span>{LABELS[b.key]}</span>
            <div className="h-12">
              <div
                className="h-full min-w-[2px] rounded-r-[4px]"
                style={{ width: `${b.ratio * 100}%`, backgroundColor: SERIES[b.key] }}
              />
            </div>
            <span className="text-right tabular-nums">
              {formatWeight(b.weight)} voix
              {b.shareOfExpressed !== null && ` · ${share(b.weight, result.tallies.expressed.weight)}`}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Décompte de la résolution {result.number}</caption>
        <thead>
          <tr>
            <th>Choix</th>
            <th>Voix</th>
            <th>Votants</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <td>{LABELS[b.key]}</td>
              <td>{formatWeight(b.weight)}</td>
              <td>{b.heads}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-2xl text-[#c3c2b7]">
        Suffrages exprimés : {formatWeight(result.tallies.expressed.weight)} voix
      </p>
    </section>
  );
}
