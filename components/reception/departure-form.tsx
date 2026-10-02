"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { heldProxiesFollowTransfer, type SnapshotAttendee } from "@/lib/reception/model";
import { failure, useReception, type Failure } from "./context";
import { FailureAlert } from "./violations";

type Mode = "transfer" | "temporary" | "leave";

const MODES: [Mode, string][] = [
  ["transfer", "Départ définitif : ses voix sont confiées à une personne présente"],
  ["temporary", "Absence temporaire : voix confiées, retour prévu"],
  ["leave", "Départ sans transmission : ses voix sortent du décompte"],
];

// Départ en cours de séance (SPEC §5.6). Tout ou rien : si le destinataire dépasserait un
// plafond, rien n'est fait et l'opérateur choisit une autre personne (ou le bureau déroge).
export function DepartureForm({ attendee }: { attendee: SnapshotAttendee }) {
  const { supabase, isBureau, snapshot, refresh } = useReception();
  const [mode, setMode] = useState<Mode>("transfer");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<Failure>();
  const [pending, startTransition] = useTransition();

  const present = snapshot.attendees.filter((a) => a.status === "present" && a.id !== attendee.id);
  const needsTarget = mode !== "leave";
  const heldFollow = heldProxiesFollowTransfer(snapshot.assembly.proxy_rules);

  const submit = (derogation?: string) =>
    startTransition(async () => {
      setError(undefined);
      const { error: rpcError } = await supabase.rpc("check_out", {
        p_attendee: attendee.id,
        p_mode: mode,
        ...(needsTarget ? { p_transfer_to: target } : {}),
        p_expected_version: attendee.version,
        ...(derogation ? { p_derogation_reason: derogation } : {}),
      });
      await refresh();
      if (rpcError) setError(failure(rpcError));
    });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="departure-title">
      <h3 id="departure-title" className="font-semibold">
        Départ
      </h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Type de départ</legend>
        {MODES.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="departure-mode"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {needsTarget && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="departure-target">Personne qui reçoit ses voix</Label>
          <Select id="departure-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choisir une personne présente…</option>
            {present.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {needsTarget && attendee.proxy_member_ids.length > 0 && !heldFollow && (
        <Alert>
          Les règles de l&apos;assemblée interdisent la sous-délégation : les{" "}
          {attendee.proxy_member_ids.length} pouvoir(s) qu&apos;elle détient ne sont pas transmis et ne
          comptent plus jusqu&apos;à son retour.
        </Alert>
      )}
      {attendee.device?.kind === "loaned" && (
        <p className="text-muted-foreground text-sm">Pensez à récupérer la tablette prêtée.</p>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={pending || (needsTarget && !target)}
          onClick={() => submit()}
        >
          Enregistrer le départ
        </Button>
      </div>
      {error && (
        <FailureAlert
          failure={error}
          isBureau={isBureau}
          pending={pending}
          hint="Choisissez une autre personne, ou enregistrez un départ sans transmission."
          onDerogate={(r) => submit(r)}
        />
      )}
    </section>
  );
}
