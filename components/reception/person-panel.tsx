"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/format";
import { PRESENCE_LABELS, type SnapshotAttendee, type SnapshotMember } from "@/lib/reception/model";
import { CheckInForm } from "./check-in-form";
import { failure, useReception, type Failure } from "./context";
import { DepartureForm } from "./departure-form";
import { DeviceSection } from "./device-section";
import { ReceivedProxyForm } from "./received-proxy-form";
import { FailureAlert } from "./violations";

const time = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

// Fiche d'un membre ou d'une personne : sa situation et l'action attendue (émargement, appareil
// de vote, pouvoir reçu, départ, retour).
export function PersonPanel({
  memberId,
  attendeeId,
}: {
  memberId: string | null;
  attendeeId: string | null;
}) {
  const { snapshot } = useReception();
  const member = memberId ? snapshot.members.find((m) => m.id === memberId) : undefined;
  const attendee = attendeeId ? snapshot.attendees.find((a) => a.id === attendeeId) : undefined;
  const byId = new Map(snapshot.attendees.map((a) => [a.id, a]));
  const membersById = new Map(snapshot.members.map((m) => [m.id, m]));

  if (!member && !attendee) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Personne non prévue</h2>
        <p className="text-muted-foreground text-sm">
          Mandataire ou invité absent de la liste : sa fiche est créée à l&apos;émargement (tracé).
        </p>
        <CheckInForm />
      </div>
    );
  }

  const title = member?.name ?? attendee!.full_name;
  const status = member?.presence ?? attendee!.status;
  const holder = member?.proxy?.holder_attendee_id ? byId.get(member.proxy.holder_attendee_id) : undefined;
  const proxyWarning =
    member?.proxy && (!attendee || attendee.status === "expected")
      ? member.proxy.status === "pending"
        ? "Ce membre a donné un pouvoir en blanc : il sera annulé à son émargement."
        : `Ce membre a donné pouvoir à ${holder?.full_name ?? "un mandataire"} : ce pouvoir sera annulé à son émargement.`
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          <Badge
            variant={status === "present" ? "success" : status === "represented" ? "secondary" : "outline"}
          >
            {PRESENCE_LABELS[status] ?? status}
          </Badge>
          {attendee && attendee.id === snapshot.assembly.president_attendee_id && (
            <Badge variant="warning">Président de séance</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {[
            member?.ref && `Réf. ${member.ref}`,
            member && `${formatWeight(member.weight)} voix (${snapshot.quorum.weight_key.label})`,
            member?.kind === "legal_entity" &&
              member.representative &&
              `Représentant : ${member.representative}`,
            attendee && attendee.full_name !== title && `Personne : ${attendee.full_name}`,
            attendee?.checked_in_at && `Arrivée ${time(attendee.checked_in_at)}`,
            attendee?.status === "left" &&
              attendee.checked_out_at &&
              `Départ ${time(attendee.checked_out_at)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {member?.ineligible && <p className="text-sm">Ce membre ne peut pas recevoir de pouvoir.</p>}
      </div>

      {attendee && attendee.status !== "expected" && <Portfolio attendee={attendee} members={membersById} />}

      {member?.presence === "represented" && !attendee && (
        <p className="text-sm">
          Représenté par <strong>{byId.get(member.holder_attendee_id ?? "")?.full_name}</strong>. S&apos;il
          arrive, l&apos;émargement annule son pouvoir.
        </p>
      )}

      {(!attendee || attendee.status === "expected") && (
        <CheckInForm member={member} attendee={attendee} proxyWarning={proxyWarning} />
      )}

      {attendee?.status === "present" && (
        <>
          <DeviceSection attendee={attendee} />
          <ReceivedProxyForm attendee={attendee} />
          <DepartureForm attendee={attendee} />
        </>
      )}

      {attendee?.status === "left" && <ReturnSection attendee={attendee} />}
    </div>
  );
}

function Portfolio({
  attendee,
  members,
}: {
  attendee: SnapshotAttendee;
  members: Map<string, SnapshotMember>;
}) {
  const own = attendee.member_ids.map((id) => members.get(id)).filter((m) => m !== undefined);
  const held = attendee.proxy_member_ids.map((id) => members.get(id)).filter((m) => m !== undefined);
  const total = [...own, ...held].reduce((sum, m) => sum + Number(m.weight), 0);
  if (own.length + held.length === 0) {
    return <p className="text-sm">Ne porte aucune voix.</p>;
  }
  return (
    <section className="flex flex-col gap-2" aria-labelledby="portfolio-title">
      <h3 id="portfolio-title" className="font-semibold">
        Voix portées : {formatWeight(total)}
      </h3>
      <ul className="text-sm">
        {own.map((m) => (
          <li key={m.id}>
            En son nom : {m.name} ({formatWeight(m.weight)})
          </li>
        ))}
        {held.map((m) => (
          <li key={m.id}>
            Pouvoir de {m.name} ({formatWeight(m.weight)})
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReturnSection({ attendee }: { attendee: SnapshotAttendee }) {
  const { supabase, isBureau, refresh } = useReception();
  const [error, setError] = useState<Failure>();
  const [pending, startTransition] = useTransition();
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">
        Elle a quitté la salle. À son retour, ses voix lui reviennent, ainsi que les pouvoirs confiés pendant
        une absence temporaire.
      </p>
      <div>
        <Button
          type="button"
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              const { error: rpcError } = await supabase.rpc("return_attendee", {
                p_attendee: attendee.id,
                p_expected_version: attendee.version,
              });
              await refresh();
              if (rpcError) setError(failure(rpcError));
            })
          }
        >
          Enregistrer son retour
        </Button>
      </div>
      {error && <FailureAlert failure={error} isBureau={isBureau} />}
    </section>
  );
}
