// Abonnement à un canal de signaux, avec repli sur une relecture périodique (plan §1, principe 6).
//
// Le canal ne transporte que des signaux d'invalidation : à chaque signal, l'écran relit son
// état par RPC. Tant que le canal n'est pas « SUBSCRIBED » (connexion en cours, coupée,
// refusée), l'écran relit toutes les `fallbackMs`. Une fois abonné, il relit une fois (pour
// rattraper les signaux manqués) puis seulement sur signal, avec une relecture de sécurité lente.

export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export type LiveChannel = {
  onSignal: (handler: () => void) => void;
  subscribe: (handler: (status: ChannelStatus) => void) => void;
  unsubscribe: () => void;
};

export type LiveOptions = {
  refresh: () => void;
  onLiveChange?: (live: boolean) => void;
  fallbackMs?: number;
  safetyMs?: number;
  debounceMs?: number;
};

export function topicFor(assemblyId: string, audience: "staff" | "voters"): string {
  return `assembly:${assemblyId}:${audience}`;
}

export function connectLive(channel: LiveChannel, options: LiveOptions): () => void {
  const { refresh, onLiveChange, fallbackMs = 3000, safetyMs = 30000, debounceMs = 250 } = options;
  let live = false;
  let disposed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let lastRefresh = Date.now();

  const run = () => {
    lastRefresh = Date.now();
    refresh();
  };
  // Plusieurs signaux rapprochés (un émargement en émet plusieurs) : une seule relecture.
  const schedule = () => {
    if (disposed || pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      if (!disposed) run();
    }, debounceMs);
  };
  const setLive = (value: boolean) => {
    if (live === value) return;
    live = value;
    onLiveChange?.(value);
  };

  const timer = setInterval(
    () => {
      const since = Date.now() - lastRefresh;
      if ((!live && since >= fallbackMs) || since >= safetyMs) run();
    },
    Math.min(fallbackMs, 1000),
  );

  channel.onSignal(schedule);
  channel.subscribe((status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      setLive(true);
      schedule();
    } else {
      setLive(false);
    }
  });

  return () => {
    disposed = true;
    clearInterval(timer);
    if (pending) clearTimeout(pending);
    channel.unsubscribe();
  };
}
