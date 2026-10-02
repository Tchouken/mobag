import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectLive, topicFor, type ChannelStatus } from "@/lib/realtime/live";

function fakeChannel() {
  let signal: () => void = () => {};
  let status: (s: ChannelStatus) => void = () => {};
  return {
    channel: {
      onSignal: (h: () => void) => (signal = h),
      subscribe: (h: (s: ChannelStatus) => void) => (status = h),
      unsubscribe: vi.fn(),
    },
    signal: () => signal(),
    status: (s: ChannelStatus) => status(s),
  };
}

describe("temps réel : canal et repli", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("nomme les canaux de l'AG", () => {
    expect(topicFor("ag", "staff")).toBe("assembly:ag:staff");
    expect(topicFor("ag", "voters")).toBe("assembly:ag:voters");
  });

  it("relit toutes les 3 s tant que le canal n'est pas abonné", () => {
    const fake = fakeChannel();
    const refresh = vi.fn();
    connectLive(fake.channel, { refresh });
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("abonné : rattrapage puis relecture sur signal seulement, signaux regroupés", () => {
    const fake = fakeChannel();
    const refresh = vi.fn();
    const onLiveChange = vi.fn();
    connectLive(fake.channel, { refresh, onLiveChange });
    fake.status("SUBSCRIBED");
    expect(onLiveChange).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10000);
    expect(refresh).toHaveBeenCalledTimes(1);

    fake.signal();
    fake.signal();
    fake.signal();
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("relecture de sécurité lente même abonné", () => {
    const fake = fakeChannel();
    const refresh = vi.fn();
    connectLive(fake.channel, { refresh, safetyMs: 30000 });
    fake.status("SUBSCRIBED");
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(29000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("canal coupé : retour au repli", () => {
    const fake = fakeChannel();
    const refresh = vi.fn();
    const onLiveChange = vi.fn();
    connectLive(fake.channel, { refresh, onLiveChange });
    fake.status("SUBSCRIBED");
    vi.advanceTimersByTime(250);
    fake.status("CHANNEL_ERROR");
    expect(onLiveChange).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(4000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("libère le canal et les minuteurs", () => {
    const fake = fakeChannel();
    const refresh = vi.fn();
    const dispose = connectLive(fake.channel, { refresh });
    dispose();
    vi.advanceTimersByTime(10000);
    fake.signal();
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
    expect(fake.channel.unsubscribe).toHaveBeenCalled();
  });
});
