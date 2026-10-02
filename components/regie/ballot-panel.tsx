"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { describeRule } from "@/lib/domain/rules";
import { formatWeight } from "@/lib/format";
import {
  countdown,
  currentBallot,
  resolutionState,
  share,
  STATE_LABELS,
  type BallotProgress,
  type RegieResolution,
} from "@/lib/regie/model";
import { ResultTable } from "./result-table";

export type BallotActions = {
  open: (resolutionId: string, seconds: number | null) => void;
  close: (ballotId: string) => void;
  remind: (ballotId: string) => void;
  timer: (ballotId: string, seconds: number | null) => void;
  validate: (ballotId: string) => void;
  cancel: (ballotId: string, reason: string) => void;
};

const DURATIONS: [string, string][] = [
  ["", "Sans minuteur"],
  ["30", "30 secondes"],
  ["60", "1 minute"],
  ["120", "2 minutes"],
  ["300", "5 minutes"],
];

// Pilotage du vote d'une résolution : ouverture, participation sans tendance, minuteur,
// relance, clôture, résultat provisoire, validation, annulation.
export function BallotPanel({
  resolution,
  bodyHtml,
  progress,
  inSession,
  otherOpen,
  isBureau,
  isPresident,
  pending,
  now,
  actions,
}: {
  resolution: RegieResolution;
  bodyHtml: string | null;
  progress: BallotProgress | null;
  inSession: boolean;
  otherOpen: boolean;
  isBureau: boolean;
  isPresident: boolean;
  pending: boolean;
  now: number;
  actions: BallotActions;
}) {
  const [duration, setDuration] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const state = resolutionState(resolution);
  const ballot = currentBallot(resolution);
  const cancelled = resolution.ballots.filter((b) => b.status === "cancelled");
  const remaining = ballot?.status === "open" ? countdown(ballot.closes_at, now) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">
            {resolution.number && `Résolution ${resolution.number} — `}
            {resolution.title}
          </h2>
          <Badge variant={state === "open" ? "warning" : "outline"}>{STATE_LABELS[state]}</Badge>
        </div>
        {state !== "information" && (
          <p className="text-muted-foreground text-sm">
            {describeRule(resolution.majority_rule)} · clé « {resolution.weight_key} »
            {resolution.is_secret && " · vote secret"}
            {resolution.board_recommendation &&
              ` · avis du conseil : ${resolution.board_recommendation === "for" ? "favorable" : "défavorable"}`}
          </p>
        )}
      </div>

      {bodyHtml && (
        <div
          className="prose prose-sm border-border max-h-64 max-w-none overflow-y-auto rounded-md border p-3"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      )}

      {state === "to_vote" && isBureau && (
        <section className="flex flex-wrap items-end gap-3" aria-label="Ouverture du vote">
          {!inSession ? (
            <p className="text-sm">Le vote s&apos;ouvre une fois la séance ouverte.</p>
          ) : resolution.mode !== "electronic" ? (
            <p className="text-sm">Vote à main levée : disponible dans une prochaine version.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ballot-duration">Minuteur</Label>
                <Select id="ballot-duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
                  {DURATIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="lg"
                disabled={pending || otherOpen}
                onClick={() => actions.open(resolution.id, duration ? Number(duration) : null)}
              >
                Ouvrir le vote
              </Button>
              {otherOpen && <p className="text-sm">Un autre vote est ouvert : clôturez-le d&apos;abord.</p>}
            </>
          )}
        </section>
      )}

      {state === "open" && ballot && (
        <section className="flex flex-col gap-3" aria-label="Vote en cours">
          {progress && progress.ballot_id === ballot.id && (
            <div className="flex flex-col gap-2" data-testid="participation">
              <p>
                Ont voté : <strong>{formatWeight(progress.voted.weight)}</strong> voix sur{" "}
                {formatWeight(progress.eligible.weight)} (
                {share(progress.voted.weight, progress.eligible.weight)}) · {progress.voted.heads} /{" "}
                {progress.eligible.heads} membres
              </p>
              <div
                className="bg-muted h-3 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-label="Participation"
                aria-valuemin={0}
                aria-valuemax={Number(progress.eligible.weight)}
                aria-valuenow={Number(progress.voted.weight)}
              >
                <div
                  className="bg-primary h-full transition-all"
                  style={{
                    width: `${Number(progress.eligible.weight) > 0 ? (Number(progress.voted.weight) / Number(progress.eligible.weight)) * 100 : 0}%`,
                  }}
                />
              </div>
              {progress.without_holder > 0 && (
                <p className="text-muted-foreground text-sm">
                  {progress.without_holder} membre(s) partis sans transmettre leurs voix : comptés présents,
                  sans vote.
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                Les tendances restent masquées jusqu&apos;à la clôture.
              </p>
            </div>
          )}
          {remaining && (
            <p className="text-2xl font-semibold tabular-nums" data-testid="countdown">
              Clôture dans {remaining}
            </p>
          )}
          {isBureau && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Clore le vote ? Aucun vote ne sera plus accepté."))
                    actions.close(ballot.id);
                }}
              >
                Clore le vote
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => actions.remind(ballot.id)}>
                Relancer les retardataires
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => actions.timer(ballot.id, 60)}>
                Clore dans 1 minute
              </Button>
              {ballot.closes_at && (
                <Button variant="ghost" disabled={pending} onClick={() => actions.timer(ballot.id, null)}>
                  Retirer le minuteur
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {(state === "provisional" || state === "validated") && ballot && (
        <section className="flex flex-col gap-4" aria-label="Résultat">
          <ResultTable ballot={ballot} abstention={resolution.abstention_policy} />
          {state === "provisional" && isPresident && (
            <div>
              <Button size="lg" disabled={pending} onClick={() => actions.validate(ballot.id)}>
                Valider le résultat
              </Button>
            </div>
          )}
          {state === "provisional" && !isPresident && (
            <p className="text-sm">La validation revient au président de séance.</p>
          )}
          {state === "provisional" && isBureau && (
            <details className="text-sm">
              <summary className="cursor-pointer">Annuler ce vote (incident)…</summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cancel-reason">Motif (obligatoire)</Label>
                  <Input
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    maxLength={500}
                    className="w-80"
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={pending || !cancelReason.trim()}
                  onClick={() => actions.cancel(ballot.id, cancelReason)}
                >
                  Annuler et permettre un nouveau vote
                </Button>
              </div>
            </details>
          )}
        </section>
      )}

      {cancelled.length > 0 && (
        <Alert>
          {cancelled.map((b) => (
            <p key={b.id}>
              Vote n° {b.round} annulé : {b.cancelled_reason}
            </p>
          ))}
        </Alert>
      )}
    </div>
  );
}
