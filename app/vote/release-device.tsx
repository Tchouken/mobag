"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export function ReleaseDevice({ loaned }: { loaned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={() => {
        const question = loaned
          ? "Rendre la tablette ? Elle ne pourra plus voter en votre nom."
          : "Dissocier cet appareil ? Il ne pourra plus voter en votre nom.";
        if (!window.confirm(question)) return;
        startTransition(async () => {
          const supabase = createClient();
          await supabase.rpc("release_voter_device");
          await supabase.auth.signOut();
          router.replace("/v");
        });
      }}
    >
      {loaned ? "Rendre la tablette" : "Ce n'est pas moi / dissocier cet appareil"}
    </Button>
  );
}
