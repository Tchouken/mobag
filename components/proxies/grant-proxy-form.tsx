"use client";

import { useState, useTransition } from "react";
import {
  attachProxyDocument,
  grantProxy,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/proxies/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { canBeDerogated, violationMessage, type Violation } from "@/lib/proxies";
import { createClient } from "@/lib/supabase/browser";
import { MemberCombobox, type MemberOption } from "./member-combobox";

type Props = {
  orgId: string;
  assemblyId: string;
  grantors: MemberOption[];
  holders: MemberOption[];
  attendees: { id: string; full_name: string }[];
  blankAllowed: boolean;
  blankHint: string;
  isBureau: boolean;
};

type HolderMode = "member" | "attendee" | "third";
const MAX_DOC = 10 * 1024 * 1024;
const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function GrantProxyForm({
  orgId,
  assemblyId,
  grantors,
  holders,
  attendees,
  blankAllowed,
  blankHint,
  isBureau,
}: Props) {
  const [grantor, setGrantor] = useState<string | null>(null);
  const [type, setType] = useState<"named" | "blank">("named");
  const [mode, setMode] = useState<HolderMode>("member");
  const [holderMember, setHolderMember] = useState<string | null>(null);
  const [holderAttendee, setHolderAttendee] = useState("");
  const [thirdName, setThirdName] = useState("");
  const [thirdEmail, setThirdEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [derogation, setDerogation] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const holder =
    type === "blank"
      ? null
      : mode === "member"
        ? holderMember
          ? { member_id: holderMember }
          : null
        : mode === "attendee"
          ? holderAttendee
            ? { attendee_id: holderAttendee }
            : null
          : thirdName.trim()
            ? { full_name: thirdName, email: thirdEmail }
            : null;

  const reset = () => {
    setGrantor(null);
    setHolderMember(null);
    setHolderAttendee("");
    setThirdName("");
    setThirdEmail("");
    setFile(null);
    setViolations([]);
    setDerogation("");
    setFormKey((k) => k + 1);
  };

  const submit = (withDerogation: boolean) =>
    startTransition(async () => {
      setError(undefined);
      setSuccess(undefined);
      if (file && (!DOC_TYPES[file.type] || file.size > MAX_DOC)) {
        setError("Le scan doit être un PDF, JPEG ou PNG de 10 Mo au plus.");
        return;
      }
      const result = await grantProxy(orgId, assemblyId, {
        grantor,
        type,
        holder,
        derogation: withDerogation ? derogation : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        setViolations(result.violations ?? []);
        return;
      }
      const label = grantors.find((g) => g.id === grantor)?.label ?? "";
      if (file) {
        const objectPath = `${assemblyId}/${result.proxyId}/${crypto.randomUUID()}.${DOC_TYPES[file.type]}`;
        const { error: uploadError } = await createClient()
          .storage.from("proxy-documents")
          .upload(objectPath, file, { contentType: file.type });
        const attached = uploadError
          ? { error: "Dépôt du scan impossible." }
          : await attachProxyDocument(orgId, assemblyId, result.proxyId, objectPath);
        if (attached.error) {
          setSuccess(
            `Pouvoir de ${label} enregistré, mais le scan n'a pas pu être joint : ${attached.error}`,
          );
          reset();
          return;
        }
      }
      setSuccess(`Pouvoir de ${label} enregistré${withDerogation ? " (avec dérogation)" : ""}.`);
      reset();
    });

  const derogable = isBureau && canBeDerogated(violations);

  return (
    <form
      key={formKey}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label id="grantor-label" htmlFor="grantor">
          Mandant (membre qui donne pouvoir)
        </Label>
        <MemberCombobox
          id="grantor"
          labelledBy="grantor-label"
          options={grantors}
          value={grantor}
          onChange={setGrantor}
          placeholder="Rechercher par nom ou référence"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Type de pouvoir</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="type" checked={type === "named"} onChange={() => setType("named")} />
          Nominatif (le mandant désigne son mandataire)
        </label>
        <label className={`flex items-center gap-2 ${blankAllowed ? "" : "text-muted-foreground"}`}>
          <input
            type="radio"
            name="type"
            disabled={!blankAllowed}
            checked={type === "blank"}
            onChange={() => setType("blank")}
          />
          En blanc — {blankHint}
        </label>
      </fieldset>

      {type === "named" && (
        <fieldset className="border-border flex flex-col gap-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Mandataire</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["member", "Un autre membre"],
                ["attendee", "Une personne déjà enregistrée"],
                ["third", "Un tiers"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="holder-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {mode === "member" && (
            <div className="flex flex-col gap-2">
              <Label id="holder-label" htmlFor="holder-member">
                Membre mandataire
              </Label>
              <MemberCombobox
                id="holder-member"
                labelledBy="holder-label"
                value={holderMember}
                onChange={setHolderMember}
                options={holders.filter((h) => h.id !== grantor)}
                placeholder="Rechercher par nom ou référence"
              />
            </div>
          )}
          {mode === "attendee" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="holder-attendee">Personne</Label>
              <Select
                id="holder-attendee"
                value={holderAttendee}
                onChange={(e) => setHolderAttendee(e.target.value)}
              >
                <option value="">Choisir…</option>
                {attendees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {mode === "third" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="third-name">Nom du mandataire</Label>
                <Input
                  id="third-name"
                  value={thirdName}
                  onChange={(e) => setThirdName(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="third-email">E-mail (facultatif)</Label>
                <Input
                  id="third-email"
                  type="email"
                  value={thirdEmail}
                  onChange={(e) => setThirdEmail(e.target.value)}
                />
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="scan">Scan du pouvoir signé (facultatif : PDF, JPEG ou PNG, 10 Mo)</Label>
        <input
          id="scan"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="file:border-border file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5"
        />
      </div>

      {error && (
        <Alert variant="destructive" className="flex flex-col gap-2">
          <p>{error}</p>
          {violations.length > 0 && (
            <ul className="list-inside list-disc">
              {violations.map((v, i) => (
                <li key={i}>{violationMessage(v)}</li>
              ))}
            </ul>
          )}
          {violations.length > 0 && !isBureau && canBeDerogated(violations) && (
            <p className="text-sm">Seul un membre du bureau peut accorder une dérogation.</p>
          )}
        </Alert>
      )}
      {derogable && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 p-4">
          <Label htmlFor="derogation">Motif de la dérogation (bureau)</Label>
          <Input
            id="derogation"
            value={derogation}
            onChange={(e) => setDerogation(e.target.value)}
            maxLength={500}
            placeholder="Ex. : décision du bureau, constatée en séance"
          />
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !derogation.trim()}
              onClick={() => submit(true)}
            >
              Enregistrer avec dérogation
            </Button>
          </div>
        </div>
      )}
      {success && (
        <Alert variant="success" role="status">
          {success}
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={pending || !grantor || (type === "named" && !holder)}>
          {pending ? "Enregistrement…" : "Enregistrer le pouvoir"}
        </Button>
      </div>
    </form>
  );
}
