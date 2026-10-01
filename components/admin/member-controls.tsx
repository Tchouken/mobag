"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeRole, removeMember, revokeInvitation } from "@/app/(admin)/orgs/[orgId]/members/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ORG_ROLE_LABELS, ORG_ROLES, type OrgRole } from "@/lib/labels";

type MemberControlsProps = {
  orgId: string;
  userId: string;
  role: OrgRole;
  isSelf: boolean;
  canAdmin: boolean;
};

export function MemberControls({ orgId, userId, role, isSelf, canAdmin }: MemberControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(undefined);
      const result = await fn();
      if (result.error) setError(result.error);
      else after?.();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {canAdmin ? (
          <Select
            aria-label="Rôle"
            className="h-9 w-40"
            value={role}
            disabled={pending}
            onChange={(e) => run(() => changeRole(orgId, userId, e.target.value))}
          >
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-sm">{ORG_ROLE_LABELS[role]}</span>
        )}
        {(canAdmin || isSelf) && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              const question = isSelf
                ? "Quitter cette organisation ?"
                : "Retirer ce membre de l'organisation ?";
              if (!window.confirm(question)) return;
              run(
                () => removeMember(orgId, userId),
                () => isSelf && router.push("/orgs"),
              );
            }}
          >
            {isSelf ? "Quitter" : "Retirer"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function RevokeInvitationButton({ orgId, invitationId }: { orgId: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvitation(orgId, invitationId);
            setError(result.error);
          })
        }
      >
        Révoquer
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
