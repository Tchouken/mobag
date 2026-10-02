"use client";

import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultAttendeeName, type SnapshotAttendee, type SnapshotMember } from "@/lib/reception/model";
import { failure, useReception, type Failure } from "./context";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { FailureAlert } from "./violations";

// Émargement : la personne signe, puis elle est déclarée présente. Si elle n'existe pas encore
// (membre sans fiche, personne non prévue), sa fiche est créée d'abord : la signature est
// rangée dans son dossier.
export function CheckInForm({
  member,
  attendee,
  proxyWarning,
}: {
  member?: SnapshotMember;
  attendee?: SnapshotAttendee;
  proxyWarning?: string;
}) {
  const { supabase, assemblyId, isBureau, refresh, select } = useReception();
  const [name, setName] = useState(attendee?.full_name ?? (member ? defaultAttendeeName(member) : ""));
  const [email, setEmail] = useState("");
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<Failure>();
  const [pending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle | null>(null);
  const isNewPerson = !member && !attendee;

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      let attendeeId = attendee?.id;
      if (!attendeeId) {
        const { data, error: createError } = await supabase.rpc("upsert_attendee", {
          p_assembly: assemblyId,
          p_attendee: null as unknown as string,
          p_full_name: name,
          p_email: email,
          p_phone: "",
          p_member_ids: member ? [member.id] : [],
          p_is_proxy_ineligible: false,
        });
        if (createError || !data) {
          setError(failure(createError));
          return;
        }
        attendeeId = data;
      }

      const blob = await pad.current?.toBlob();
      if (!blob) {
        setError({ message: "Signature illisible : effacez et recommencez.", violations: [] });
        return;
      }
      const path = `${assemblyId}/${attendeeId}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(path, blob, { contentType: "image/png" });
      if (uploadError) {
        setError({ message: "La signature n'a pas pu être enregistrée. Réessayez.", violations: [] });
        await refresh();
        return;
      }

      const { error: checkInError } = await supabase.rpc("check_in", {
        p_assembly: assemblyId,
        p_attendee: attendeeId,
        p_signature_path: path,
        ...(attendee ? { p_expected_version: attendee.version } : {}),
      });
      await refresh();
      if (checkInError) {
        setError(failure(checkInError));
        return;
      }
      if (!member) select(`a:${attendeeId}`);
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {proxyWarning && <Alert>{proxyWarning}</Alert>}
      {attendee ? (
        <p>
          Personne : <strong>{attendee.full_name}</strong>
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="checkin-name">{member ? "Nom de la personne présente" : "Nom et prénom"}</Label>
            <Input
              id="checkin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </div>
          {isNewPerson && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkin-email">E-mail (facultatif)</Label>
              <Input
                id="checkin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
      <SignaturePad handleRef={pad} onChange={setSigned} label="Zone de signature" />
      {error && <FailureAlert failure={error} isBureau={isBureau} />}
      <div>
        <Button type="submit" size="lg" disabled={pending || !signed || !name.trim()}>
          {pending ? "Enregistrement…" : "Valider l'émargement"}
        </Button>
      </div>
    </form>
  );
}
