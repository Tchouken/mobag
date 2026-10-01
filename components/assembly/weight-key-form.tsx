"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteWeightKey,
  saveWeightKey,
  type ActionState,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WeightKey = {
  id: string;
  code: string;
  label: string;
  total_declared: number | null;
  is_primary: boolean;
};

export function WeightKeyForm({
  orgId,
  assemblyId,
  weightKey,
  onDone,
}: {
  orgId: string;
  assemblyId: string;
  weightKey?: WeightKey;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveWeightKey(orgId, assemblyId, prev, formData);
    if (!result.error) onDone?.();
    return result;
  }, {});
  const prefix = weightKey?.id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={weightKey?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-code`}>Code</Label>
          <Input
            id={`${prefix}-code`}
            name="code"
            required
            maxLength={30}
            pattern="[a-z0-9_]+"
            defaultValue={weightKey?.code}
            placeholder="actions_ordinaires"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-label`}>Libellé</Label>
          <Input
            id={`${prefix}-label`}
            name="label"
            required
            maxLength={100}
            defaultValue={weightKey?.label}
            placeholder="Actions ordinaires"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-total`}>Total déclaré</Label>
          <Input
            id={`${prefix}-total`}
            name="total_declared"
            inputMode="decimal"
            defaultValue={weightKey?.total_declared ?? ""}
            placeholder="Facultatif"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`${prefix}-primary`}
          name="is_primary"
          type="checkbox"
          className="size-4"
          defaultChecked={weightKey?.is_primary ?? false}
        />
        <Label htmlFor={`${prefix}-primary`}>
          Clé principale (quorum de l&apos;AG et plafonds de pouvoirs)
        </Label>
      </div>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {weightKey ? "Enregistrer" : "Ajouter la clé"}
        </Button>
      </div>
    </form>
  );
}

export function WeightKeyRowActions({
  orgId,
  assemblyId,
  weightKey,
}: {
  orgId: string;
  assemblyId: string;
  weightKey: WeightKey;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (editing) {
    return (
      <div className="flex flex-col gap-2 py-2 text-left">
        <WeightKeyForm
          orgId={orgId}
          assemblyId={assemblyId}
          weightKey={weightKey}
          onDone={() => setEditing(false)}
        />
        <div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Modifier
        </Button>
        {!weightKey.is_primary && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Supprimer la clé « ${weightKey.label} » ?`)) return;
              startTransition(async () =>
                setError((await deleteWeightKey(orgId, assemblyId, weightKey.id)).error),
              );
            }}
          >
            Supprimer
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
