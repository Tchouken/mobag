"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/format";
import { countdown } from "@/lib/regie/model";
import { rpcErrorMessage } from "@/lib/rpc/errors";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import {
  buildItems,
  CHOICE_LABELS,
  CHOICES,
  editableMembers,
  isRetryable,
  parsePending,
  pendingKey,
  retryDelay,
  totalWeight,
  type Choice,
  type OpenBallot,
  type PendingVote,
} from "@/lib/voter/ballot";

type Step =
  | { name: "choose" }
  | { name: "confirm" }
  | { name: "sending"; attempt: number; retryIn: number | null }
  | { name: "done"; at: string }
  | { name: "error"; message: string };

const CHOICE_STYLES: Record<Choice, string> = {
  for: "bg-emerald-700 text-white border-emerald-700",
  against: "bg-red-700 text-white border-red-700",
  abstain: "bg-slate-700 text-white border-slate-700",
};

const storage = {
  read: (ballotId: string) => {
    try {
      return parsePending(window.localStorage.getItem(pendingKey(ballotId)));
    } catch {
      return null;
    }
  },
  write: (ballotId: string, pending: PendingVote) => {
    try {
      window.localStorage.setItem(pendingKey(ballotId), JSON.stringify(pending));
    } catch {
      /* stockage indisponible : l'envoi continue sans reprise après rechargement */
    }
  },
  clear: (ballotId: string) => {
    try {
      window.localStorage.removeItem(pendingKey(ballotId));
    } catch {
      /* idem */
    }
  },
};

const time = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
    new Date(iso),
  );

// Vote d'une résolution (SPEC §5.8) : choix → confirmation explicite → envoi idempotent avec
// réessais → « Vote enregistré » affiché uniquement sur confirmation du serveur.
export function VoteForm({ ballot, bodyHtml }: { ballot: OpenBallot; bodyHtml: string | null }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const editable = editableMembers(ballot);
  const multiple = editable.length > 1;
  const alreadyVoted = ballot.members.length > 0 && ballot.members.every((m) => m.choice !== null);
  const [step, setStep] = useState<Step>(() =>
    alreadyVoted ? { name: "done", at: "" } : { name: "choose" },
  );
  const [mode, setMode] = useState<"same" | "distinct">("same");
  const [same, setSame] = useState<Choice | null>(null);
  const [perMember, setPerMember] = useState<Record<string, Choice | undefined>>({});
  const [reminded, setReminded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);

  const items = buildItems(ballot, mode, same, perMember);

  const send = async (pending: PendingVote) => {
    storage.write(ballot.ballot_id, pending);
    for (let attempt = 1; alive.current; attempt++) {
      setStep({ name: "sending", attempt, retryIn: null });
      const { data, error } = await supabase.rpc("cast_votes", {
        p_ballot: ballot.ballot_id,
        p_items: pending.items,
        p_idempotency_key: pending.key,
      });
      if (!error) {
        storage.clear(ballot.ballot_id);
        setStep({ name: "done", at: (data as { at: string }).at });
        router.refresh();
        return;
      }
      if (!isRetryable(error)) {
        storage.clear(ballot.ballot_id);
        setStep({ name: "error", message: rpcErrorMessage(error) });
        router.refresh();
        return;
      }
      const delay = retryDelay(attempt);
      setStep({ name: "sending", attempt, retryIn: Math.round(delay / 1000) });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // Envoi interrompu (page rechargée, appareil mis en veille) : reprise avec la même clé.
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => {
      const pending = storage.read(ballot.ballot_id);
      if (pending) void sendRef.current(pending);
    }, 0);
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [ballot.ballot_id]);

  useEffect(() => {
    const onReminder = () => setReminded(true);
    window.addEventListener("mobag:reminder", onReminder);
    return () => window.removeEventListener("mobag:reminder", onReminder);
  }, []);

  useEffect(() => {
    if (!ballot.closes_at) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ballot.closes_at]);

  useEffect(() => {
    if (step.name === "confirm" || step.name === "done") heading.current?.focus();
  }, [step.name]);

  const remaining = countdown(ballot.closes_at, now);
  const names = new Map(ballot.members.map((m) => [m.member_id, m]));

  const header = (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-base">Résolution {ballot.resolution.number}</p>
      <h2 className="text-2xl font-semibold" ref={heading} tabIndex={-1}>
        {step.name === "confirm" ? "Confirmez votre vote" : ballot.resolution.title}
      </h2>
      {remaining && (
        <p className="text-lg font-medium tabular-nums" aria-live="off">
          Clôture du vote dans {remaining}
        </p>
      )}
    </div>
  );

  if (ballot.members.length === 0) {
    return (
      <section className="flex flex-col gap-4" aria-label={`Vote : ${ballot.resolution.title}`}>
        {header}
        <Alert>
          Vous ne détenez pas de voix pour ce vote (arrivée après son ouverture ou voix transmises).
        </Alert>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5" aria-label={`Vote : ${ballot.resolution.title}`}>
      {header}

      {reminded && step.name === "choose" && (
        <Alert role="alert" className="text-lg">
          La présidence vous rappelle que le vote est ouvert : il vous reste à voter.
        </Alert>
      )}

      {bodyHtml && step.name === "choose" && (
        <details className="border-border rounded-lg border p-3">
          <summary className="min-h-12 cursor-pointer py-2 text-lg font-medium">
            Lire le texte de la résolution
          </summary>
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </details>
      )}

      {step.name === "choose" && (
        <>
          {multiple && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-lg font-medium">Vous votez pour {editable.length} membres</legend>
              {(
                [
                  ["same", "Même vote pour toutes mes voix"],
                  ["distinct", "Vote distinct par mandant"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="border-border flex min-h-14 items-center gap-3 rounded-lg border px-4"
                >
                  <input
                    type="radio"
                    name={`mode-${ballot.ballot_id}`}
                    className="size-5"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  <span className="text-lg">{label}</span>
                </label>
              ))}
            </fieldset>
          )}

          {mode === "same" ? (
            <ChoiceGroup
              label={
                multiple
                  ? `Votre vote pour vos ${formatWeight(totalWeight(editable))} voix`
                  : `Votre vote (${formatWeight(totalWeight(editable))} voix)`
              }
              value={same}
              onChange={setSame}
            />
          ) : (
            editable.map((m) => (
              <ChoiceGroup
                key={m.member_id}
                label={`${m.via === "own" ? "En votre nom" : "Pour"} ${m.display_name} (${formatWeight(m.weight)} voix)`}
                value={perMember[m.member_id] ?? null}
                onChange={(c) => setPerMember((p) => ({ ...p, [m.member_id]: c }))}
                compact
              />
            ))
          )}

          {ballot.members.some((m) => m.choice !== null && !ballot.allow_vote_change) && (
            <p className="text-base">
              Votes déjà enregistrés (définitifs) :{" "}
              {ballot.members
                .filter((m) => m.choice)
                .map((m) => `${m.display_name} — ${CHOICE_LABELS[m.choice!]}`)
                .join(", ")}
            </p>
          )}

          <Button
            size="lg"
            className="min-h-14 text-lg"
            disabled={!items}
            onClick={() => setStep({ name: "confirm" })}
          >
            Valider mon choix
          </Button>
        </>
      )}

      {step.name === "confirm" && items && (
        <>
          <ul className="flex flex-col gap-2 text-lg">
            {items.map((i) => (
              <li
                key={i.member_id}
                className="border-border flex justify-between gap-3 rounded-lg border p-3"
              >
                <span>
                  {names.get(i.member_id)?.display_name} ({formatWeight(names.get(i.member_id)?.weight)} voix)
                </span>
                <strong>{CHOICE_LABELS[i.choice]}</strong>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="min-h-14 text-lg"
              onClick={() => void send({ key: crypto.randomUUID(), items, at: Date.now() })}
            >
              Confirmer mon vote
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-h-14 text-lg"
              onClick={() => setStep({ name: "choose" })}
            >
              Modifier mon choix
            </Button>
          </div>
        </>
      )}

      <div role="status" aria-live="polite" className="text-lg">
        {step.name === "sending" &&
          (step.retryIn === null ? (
            <p>Envoi de votre vote…</p>
          ) : (
            <p>
              Connexion difficile : nouvel essai dans {step.retryIn} s (tentative {step.attempt + 1}). Votre
              vote n&apos;est pas encore enregistré.
            </p>
          ))}
        {step.name === "done" && (
          <div
            className="flex flex-col gap-2 rounded-lg border-2 border-emerald-700 p-4"
            data-testid="vote-recorded"
          >
            <p className="text-xl font-semibold text-emerald-800 dark:text-emerald-300">
              ✓ Vote enregistré{step.at && ` à ${time(step.at)}`}
            </p>
            <ul className="text-base">
              {ballot.members.map((m) => (
                <li key={m.member_id}>
                  {m.display_name} : {m.choice ? CHOICE_LABELS[m.choice] : "en cours d'enregistrement"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {step.name === "error" && (
        <Alert variant="destructive" role="alert" className="flex flex-col gap-3 text-lg">
          <p>{step.message}</p>
          <Button variant="outline" onClick={() => setStep({ name: "choose" })}>
            Revenir au vote
          </Button>
        </Alert>
      )}

      {step.name === "done" && ballot.allow_vote_change && editable.length > 0 && (
        <Button
          size="lg"
          variant="outline"
          className="min-h-14 text-lg"
          onClick={() => {
            setSame(null);
            setPerMember({});
            setStep({ name: "choose" });
          }}
        >
          Modifier mon vote
        </Button>
      )}
    </section>
  );
}

function ChoiceGroup({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: Choice | null;
  onChange: (c: Choice) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={cn("mb-2 font-medium", compact ? "text-base" : "text-lg")}>{label}</legend>
      <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1")}>
        {CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={cn(
              "border-border min-h-14 rounded-lg border-2 px-3 text-lg font-semibold focus-visible:ring-4 focus-visible:outline-none",
              value === c ? CHOICE_STYLES[c] : "bg-background",
            )}
          >
            {value === c && "✓ "}
            {CHOICE_LABELS[c]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
