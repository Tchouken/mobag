"use client";

import QRCode from "qrcode";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SnapshotAttendee } from "@/lib/reception/model";
import { formatCode, voterLink } from "@/lib/voter/code";
import { failure, useReception, type Failure } from "./context";
import { FailureAlert } from "./violations";

type Issued = { code: string; qr: string; kind: "personal" | "loaned" };

// Appareil de vote (DECISIONS Q3) : QR à scanner avec son smartphone, ou tablette prêtée sur
// laquelle l'opérateur saisit le code. Le code n'est affiché qu'une fois : en réémettre un
// nouveau révoque le précédent.
export function DeviceSection({ attendee }: { attendee: SnapshotAttendee }) {
  const { supabase, isBureau, refresh } = useReception();
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<Issued>();
  const [error, setError] = useState<Failure>();
  const [pending, startTransition] = useTransition();
  const device = attendee.device;

  const issue = (kind: "personal" | "loaned") =>
    startTransition(async () => {
      setError(undefined);
      const { data, error: rpcError } = await supabase.rpc("issue_voter_token", {
        p_attendee: attendee.id,
        p_kind: kind,
        p_device_label: kind === "loaned" ? label : "",
      });
      if (rpcError || !data) {
        setError(failure(rpcError));
        return;
      }
      const code = (data as { code: string }).code;
      const qr = await QRCode.toDataURL(voterLink(window.location.origin, code), {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
      });
      setIssued({ code, qr, kind });
      setLabel("");
      await refresh();
    });

  const revoke = () =>
    startTransition(async () => {
      setError(undefined);
      const { error: rpcError } = await supabase.rpc("revoke_voter_token", {
        p_attendee: attendee.id,
        p_reason: device?.kind === "loaned" ? "returned" : "manual",
      });
      if (rpcError) setError(failure(rpcError));
      setIssued(undefined);
      await refresh();
    });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="device-title">
      <h3 id="device-title" className="font-semibold">
        Appareil de vote
      </h3>
      <p className="text-sm">
        {device
          ? `${device.kind === "loaned" ? `Tablette prêtée${device.label ? ` « ${device.label} »` : ""}` : "Smartphone personnel"} — ${device.claimed ? "associé" : "en attente d'association"}`
          : "Aucun appareil associé."}
      </p>

      {issued && (
        <div className="border-border flex flex-col items-center gap-2 rounded-md border p-4 text-center">
          {issued.kind === "personal" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- image générée localement (data URL) */}
              <img src={issued.qr} alt="QR code d'association" width={240} height={240} />
              <p className="text-sm">Faites scanner ce QR code avec l&apos;appareil photo du smartphone.</p>
            </>
          ) : (
            <p className="text-sm">Saisissez ce code sur la tablette (écran « Associer cet appareil ») :</p>
          )}
          <p className="font-mono text-2xl font-semibold tracking-wider" data-testid="voter-code">
            {formatCode(issued.code)}
          </p>
          <p className="text-muted-foreground text-xs">Code affiché une seule fois.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setIssued(undefined)}>
            Masquer
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" disabled={pending} onClick={() => issue("personal")}>
          QR pour son smartphone
        </Button>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="tablet-label" className="text-xs">
              Tablette n°
            </Label>
            <Input
              id="tablet-label"
              className="w-28"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={50}
              placeholder="Ex. 7"
            />
          </div>
          <Button type="button" variant="outline" disabled={pending} onClick={() => issue("loaned")}>
            Prêter une tablette
          </Button>
        </div>
        {device && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Retirer l'appareil de vote de cette personne ?")) revoke();
            }}
          >
            {device.kind === "loaned" ? "Tablette rendue" : "Retirer l'appareil"}
          </Button>
        )}
      </div>
      {error && <FailureAlert failure={error} isBureau={isBureau} />}
    </section>
  );
}
