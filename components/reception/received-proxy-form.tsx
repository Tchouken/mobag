"use client";

import { useMemo, useState, useTransition } from "react";
import { MemberCombobox, type MemberOption } from "@/components/proxies/member-combobox";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SnapshotAttendee } from "@/lib/reception/model";
import { failure, useReception, type Failure } from "./context";
import { FailureAlert } from "./violations";

// Pouvoir apporté le jour même : un membre attendu (ni présent, ni déjà mandant) confie ses voix
// à la personne présente. Mêmes contrôles qu'avant séance.
export function ReceivedProxyForm({ attendee }: { attendee: SnapshotAttendee }) {
  const { supabase, assemblyId, isBureau, snapshot, refresh } = useReception();
  const [grantor, setGrantor] = useState<string | null>(null);
  const [error, setError] = useState<Failure>();
  const [success, setSuccess] = useState<string>();
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const options = useMemo<MemberOption[]>(
    () =>
      snapshot.members
        .filter((m) => !attendee.member_ids.includes(m.id))
        .map((m) => ({
          id: m.id,
          label: m.name,
          ref: m.ref,
          disabled:
            m.presence === "present" || m.presence === "represented"
              ? "déjà compté"
              : m.proxy
                ? "pouvoir déjà donné"
                : undefined,
        })),
    [snapshot.members, attendee.member_ids],
  );

  const submit = (derogation?: string) =>
    startTransition(async () => {
      setError(undefined);
      setSuccess(undefined);
      if (!grantor) return;
      const { error: rpcError } = await supabase.rpc("grant_proxy_to", {
        p_assembly: assemblyId,
        p_grantor: grantor,
        p_holder: { attendee_id: attendee.id },
        p_type: "named",
        ...(derogation ? { p_derogation_reason: derogation } : {}),
      });
      await refresh();
      if (rpcError) {
        setError(failure(rpcError));
        return;
      }
      setSuccess(`Pouvoir de ${options.find((o) => o.id === grantor)?.label ?? ""} enregistré.`);
      setGrantor(null);
      setFormKey((k) => k + 1);
    });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="received-title">
      <h3 id="received-title" className="font-semibold">
        Pouvoir reçu
      </h3>
      <div key={formKey} className="flex flex-col gap-2">
        <span id="received-grantor-label" className="text-sm">
          Membre qui lui donne pouvoir
        </span>
        <MemberCombobox
          id="received-grantor"
          labelledBy="received-grantor-label"
          options={options}
          value={grantor}
          onChange={setGrantor}
          placeholder="Rechercher par nom ou référence"
        />
      </div>
      <div>
        <Button type="button" variant="outline" disabled={pending || !grantor} onClick={() => submit()}>
          Enregistrer le pouvoir
        </Button>
      </div>
      {error && (
        <FailureAlert failure={error} isBureau={isBureau} pending={pending} onDerogate={(r) => submit(r)} />
      )}
      {success && (
        <Alert variant="success" role="status">
          {success}
        </Alert>
      )}
    </section>
  );
}
