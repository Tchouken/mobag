"use client";

import { useActionState } from "react";
import { changeStatus, type ActionState } from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssemblyStatus } from "@/lib/assembly-labels";

export function StatusActions({
  orgId,
  assemblyId,
  status,
}: {
  orgId: string;
  assemblyId: string;
  status: AssemblyStatus;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    changeStatus.bind(null, orgId, assemblyId),
    {},
  );

  if (status === "draft") {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="to" value="convened" />
        <p className="text-muted-foreground text-sm">
          Marquez l&apos;assemblée comme convoquée une fois la convocation envoyée. Les modifications restent
          possibles jusqu&apos;à l&apos;ouverture de la séance, et sont toutes tracées.
        </p>
        {state.error && <Alert variant="destructive">{state.error}</Alert>}
        <div>
          <Button type="submit" disabled={pending}>
            Marquer comme convoquée
          </Button>
        </div>
      </form>
    );
  }

  if (status === "convened") {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="to" value="draft" />
        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">Motif du retour en brouillon</Label>
          <Input
            id="reason"
            name="reason"
            required
            maxLength={300}
            placeholder="Ex. : erreur sur la date de convocation"
          />
        </div>
        {state.error && <Alert variant="destructive">{state.error}</Alert>}
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            Repasser en brouillon
          </Button>
        </div>
      </form>
    );
  }

  return <p className="text-muted-foreground text-sm">Le pilotage de la séance arrive avec la régie.</p>;
}
