import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VoteForm } from "@/components/voter/vote-form";
import { formatWeight } from "@/lib/format";
import { renderRichText } from "@/lib/rich-text/render";
import type { OpenBallot } from "@/lib/voter/ballot";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "./live-refresh";
import { ReleaseDevice } from "./release-device";

export const metadata: Metadata = { title: "Vote" };

type VoterContext = {
  assembly: { id: string; title: string; status: string };
  attendee: { id: string; full_name: string; status: string };
  device: { kind: "personal" | "loaned"; label: string | null };
  portfolio: {
    members: { member_id: string; display_name: string; via: "own" | "proxy" }[];
    totals: { code: string; label: string; weight: number }[];
  };
  // Scrutins ouverts, lus dans le même appel (une requête par écran à l'ouverture d'un vote).
  ballots: (OpenBallot & { resolution: { body: unknown } })[];
};

export default async function VotePage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_voter_context");
  const context = data as unknown as VoterContext | null;
  if (!context) redirect("/v");
  const ballots = context.ballots ?? [];

  const own = context.portfolio.members.filter((m) => m.via === "own");
  const proxies = context.portfolio.members.filter((m) => m.via === "proxy");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8 text-lg">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-base">{context.assembly.title}</p>
        <h1 className="text-2xl font-semibold">Bonjour {context.attendee.full_name}</h1>
      </header>

      {ballots.length > 0 ? (
        ballots.map((b) => (
          <div key={b.ballot_id} className="flex flex-col gap-4">
            <p role="status" className="bg-muted rounded-lg px-4 py-2 text-base font-medium">
              Vote en cours : résolution {b.resolution.number} — {b.resolution.title}
            </p>
            <VoteForm key={b.ballot_id} ballot={b} bodyHtml={renderRichText(b.resolution.body)} />
          </div>
        ))
      ) : (
        <div role="status" className="border-border bg-muted rounded-lg border p-6 text-center">
          <p className="text-xl font-medium">Aucun vote en cours</p>
          <p className="text-muted-foreground mt-2 text-base">
            Gardez cette page ouverte : la prochaine résolution s&apos;affichera ici dès l&apos;ouverture du
            vote.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vos voix</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-base">
          <ul className="flex flex-col gap-1">
            {context.portfolio.totals.map((t) => (
              <li key={t.code} className="flex justify-between gap-4">
                <span>{t.label}</span>
                <span className="font-semibold tabular-nums">{formatWeight(t.weight)}</span>
              </li>
            ))}
          </ul>
          {own.length > 0 && <p>En votre nom : {own.map((m) => m.display_name).join(", ")}</p>}
          {proxies.length > 0 && (
            <p>
              Pouvoirs détenus ({proxies.length}) : {proxies.map((m) => m.display_name).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      <ReleaseDevice loaned={context.device.kind === "loaned"} />
      <LiveRefresh assemblyId={context.assembly.id} />
    </main>
  );
}
