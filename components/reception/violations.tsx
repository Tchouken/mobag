"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canBeDerogated, violationMessage } from "@/lib/proxies";
import type { Failure } from "./context";

// Erreur d'une action de l'accueil, avec le détail des règles de pouvoirs enfreintes et, pour
// le bureau, la possibilité de passer outre en motivant la dérogation.
export function FailureAlert({
  failure,
  isBureau,
  hint,
  onDerogate,
  pending,
}: {
  failure: Failure;
  isBureau: boolean;
  hint?: string;
  onDerogate?: (reason: string) => void;
  pending?: boolean;
}) {
  const [reason, setReason] = useState("");
  const derogable = canBeDerogated(failure.violations);
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="destructive" className="flex flex-col gap-2">
        <p>{failure.message}</p>
        {failure.violations.length > 0 && (
          <ul className="list-inside list-disc">
            {failure.violations.map((v, i) => (
              <li key={i}>{violationMessage(v)}</li>
            ))}
          </ul>
        )}
        {failure.violations.length > 0 && hint && <p className="text-sm">{hint}</p>}
        {derogable && !isBureau && (
          <p className="text-sm">Seul un membre du bureau peut accorder une dérogation.</p>
        )}
      </Alert>
      {derogable && isBureau && onDerogate && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 p-3">
          <Label htmlFor="derogation-reason">Motif de la dérogation (bureau)</Label>
          <Input
            id="derogation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Ex. : décision du bureau, constatée en séance"
          />
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !reason.trim()}
              onClick={() => onDerogate(reason)}
            >
              Valider avec dérogation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
