"use client";

import { useEffect, useRef, useState } from "react";
import type { createClient } from "@/lib/supabase/browser";
import { connectLive, topicFor, type ChannelStatus } from "./live";

type Supabase = ReturnType<typeof createClient>;

// Relit l'état de l'écran à chaque signal du canal de l'AG, ou toutes les 3 s si le canal est
// indisponible. Renvoie true tant que le temps réel fonctionne.
export function useAssemblyChannel(
  supabase: Supabase,
  assemblyId: string,
  audience: "staff" | "voters",
  refresh: () => void,
): boolean {
  const [live, setLive] = useState(false);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const channel = supabase.channel(topicFor(assemblyId, audience), { config: { private: true } });
    let dispose: (() => void) | undefined;
    let cancelled = false;
    // Le canal privé est autorisé avec le jeton de la session courante.
    void supabase.realtime.setAuth().finally(() => {
      if (cancelled) return;
      dispose = connectLive(
        {
          onSignal: (handler) => channel.on("broadcast", { event: "*" }, handler),
          subscribe: (handler) => channel.subscribe((status) => handler(status as ChannelStatus)),
          unsubscribe: () => void supabase.removeChannel(channel),
        },
        { refresh: () => refreshRef.current(), onLiveChange: setLive },
      );
    });
    return () => {
      cancelled = true;
      if (dispose) dispose();
      else void supabase.removeChannel(channel);
    };
  }, [supabase, assemblyId, audience]);

  return live;
}
