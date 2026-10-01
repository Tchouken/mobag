"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/(admin)/invitations/[token]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation.bind(null, token), {});

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Validation…" : "Rejoindre l'organisation"}
      </Button>
    </form>
  );
}
