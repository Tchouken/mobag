import type { Metadata } from "next";
import { PairDevice } from "./pair-device";

export const metadata: Metadata = { title: "Associer cet appareil — Vote" };

export default function PairPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <PairDevice />
    </main>
  );
}
