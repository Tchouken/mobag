"use client";

import { useActionState, useState, useTransition } from "react";
import {
  assignStaff,
  removeStaff,
  type ActionState,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { STAFF_ROLE_LABELS } from "@/lib/assembly-labels";

export function AssignStaffForm({
  orgId,
  assemblyId,
  members,
}: {
  orgId: string;
  assemblyId: string;
  members: { user_id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    assignStaff.bind(null, orgId, assemblyId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="staff-user">Personne</Label>
          <Select id="staff-user" name="user" required defaultValue="">
            <option value="" disabled>
              Choisir un membre de l&apos;équipe
            </option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="staff-role">Rôle</Label>
          <Select id="staff-role" name="role" defaultValue="reception">
            {Object.entries(STAFF_ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          Désigner
        </Button>
      </div>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
    </form>
  );
}

export function RemoveStaffButton({
  orgId,
  assemblyId,
  userId,
  role,
}: {
  orgId: string;
  assemblyId: string;
  userId: string;
  role: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => setError((await removeStaff(orgId, assemblyId, userId, role)).error))
        }
      >
        Retirer
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
