"use client";

import { useActionState } from "react";
import { updateInfo, type ActionState } from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AssemblyInfoFields, type AssemblyInfoDefaults } from "./assembly-info-fields";

type Props = {
  orgId: string;
  assemblyId: string;
  version: number;
  defaults: AssemblyInfoDefaults;
  disabled: boolean;
};

export function EditInfoForm({ orgId, assemblyId, version, defaults, disabled }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateInfo.bind(null, orgId, assemblyId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="version" value={version} />
      <AssemblyInfoFields defaults={defaults} disabled={disabled} />
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.success && <Alert variant="success">{state.success}</Alert>}
      {!disabled && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      )}
    </form>
  );
}
