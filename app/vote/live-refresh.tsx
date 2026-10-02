"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAssemblyChannel } from "@/lib/realtime/use-assembly-channel";
import { createClient } from "@/lib/supabase/browser";

// Recharge l'écran du votant à chaque signal de l'AG (scrutin ouvert ou clos, voix reçues
// pendant un scrutin, changement de statut), ou toutes les 3 s si le canal est indisponible.
// Signale l'appareil comme terminal connecté et relaie les relances de la régie.
export function LiveRefresh({ assemblyId }: { assemblyId: string }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const live = useAssemblyChannel(supabase, assemblyId, "voters", () => router.refresh(), {
    trackPresence: true,
    onEvent: (event) => {
      if (event !== "reminder") return;
      window.dispatchEvent(new Event("mobag:reminder"));
      navigator.vibrate?.(200);
    },
  });
  return (
    <p className="text-muted-foreground text-center text-sm" data-testid="live-status">
      {live ? "Connecté" : "Connexion en cours…"}
    </p>
  );
}
