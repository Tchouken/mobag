"use client";

import { useEffect, useRef, useState } from "react";
import type { createClient } from "@/lib/supabase/browser";
import { connectLive, topicFor, type ChannelStatus } from "./live";

type Supabase = ReturnType<typeof createClient>;

// Relit l'état de l'écran à chaque signal du canal de l'AG, ou toutes les 3 s si le canal est
// indisponible. Renvoie true tant que le temps réel fonctionne. `trackPresence` : l'appareil se
// signale comme terminal connecté (compté par la régie), sous une clé aléatoire.
export function useAssemblyChannel(
  supabase: Supabase,
  assemblyId: string,
  audience: "staff" | "voters",
  refresh: () => void,
  trackPresence = false,
): boolean {
  const [live, setLive] = useState(false);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const channel = supabase.channel(topicFor(assemblyId, audience), {
      config: { private: true, ...(trackPresence ? { presence: { key: crypto.randomUUID() } } : {}) },
    });
    let dispose: (() => void) | undefined;
    let cancelled = false;
    // Le canal privé est autorisé avec le jeton de la session courante.
    void supabase.realtime.setAuth().finally(() => {
      if (cancelled) return;
      dispose = connectLive(
        {
          onSignal: (handler) => channel.on("broadcast", { event: "*" }, handler),
          subscribe: (handler) =>
            channel.subscribe((status) => {
              if (status === "SUBSCRIBED" && trackPresence) void channel.track({});
              handler(status as ChannelStatus);
            }),
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
  }, [supabase, assemblyId, audience, trackPresence]);

  return live;
}

// Nombre de terminaux de vote connectés (présence sur le canal des votants), pour la régie.
export function useConnectedDevices(supabase: Supabase, assemblyId: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const channel = supabase.channel(topicFor(assemblyId, "voters"), { config: { private: true } });
    let cancelled = false;
    void supabase.realtime.setAuth().finally(() => {
      if (cancelled) return;
      channel
        .on("presence", { event: "sync" }, () => setCount(Object.keys(channel.presenceState()).length))
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") setCount(null);
        });
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, assemblyId]);
  return count;
}
