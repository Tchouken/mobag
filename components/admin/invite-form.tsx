"use client";

import { useActionState, useState } from "react";
import { inviteMember, type InviteState } from "@/app/(admin)/orgs/[orgId]/members/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ORG_ROLE_LABELS, ORG_ROLES } from "@/lib/labels";

export function InviteForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember.bind(null, orgId), {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">Adresse e-mail</Label>
          <Input id="invite-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">Rôle</Label>
          <Select id="invite-role" name="role" defaultValue="organizer">
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Inviter"}
        </Button>
      </form>

      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.link && (
        <Alert variant="success" className="flex flex-col gap-2">
          <p>
            Invitation créée pour <strong>{state.email}</strong>. Transmettez-lui ce lien (valable 7 jours, à
            usage unique). Il ne sera plus affiché ensuite.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={state.link}
              aria-label="Lien d'invitation"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link ?? "");
                setCopied(true);
              }}
            >
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
