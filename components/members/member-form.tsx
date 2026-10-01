"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteMember,
  saveMember,
  type MemberFormState,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/members/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type MemberDefaults = {
  kind: "person" | "legal_entity";
  last_name: string;
  first_name: string;
  company_name: string;
  display_name: string;
  external_ref: string;
  email: string;
  phone: string;
  representative_name: string;
  is_proxy_ineligible: boolean;
  weights: Record<string, string>;
};

type Props = {
  orgId: string;
  assemblyId: string;
  memberId: string | null;
  version: number | null;
  keys: { code: string; label: string }[];
  defaults: MemberDefaults;
  disabled: boolean;
};

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function MemberForm({ orgId, assemblyId, memberId, version, keys, defaults, disabled }: Props) {
  const action = saveMember.bind(
    null,
    orgId,
    assemblyId,
    memberId,
    version,
    keys.map((k) => k.code),
  );
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(action, {});
  const [kind, setKind] = useState(defaults.kind);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string>();

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-6">
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="kind">Nature</Label>
            <Select
              id="kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as MemberDefaults["kind"])}
            >
              <option value="person">Personne physique</option>
              <option value="legal_entity">Personne morale</option>
            </Select>
          </div>
          <Field
            id="external_ref"
            label="Référence"
            maxLength={50}
            defaultValue={defaults.external_ref}
            hint="N° d'associé, de lot ou d'adhérent ; unique dans l'assemblée."
          />
          {kind === "legal_entity" ? (
            <>
              <Field
                id="company_name"
                label="Raison sociale"
                maxLength={200}
                defaultValue={defaults.company_name}
                required
              />
              <Field
                id="representative_name"
                label="Représentant légal"
                maxLength={200}
                defaultValue={defaults.representative_name}
              />
            </>
          ) : (
            <>
              <Field id="last_name" label="Nom" maxLength={100} defaultValue={defaults.last_name} />
              <Field id="first_name" label="Prénom" maxLength={100} defaultValue={defaults.first_name} />
              <Field
                id="representative_name"
                label="Représentant (indivision, tutelle…)"
                maxLength={200}
                defaultValue={defaults.representative_name}
              />
            </>
          )}
          <Field
            id="display_name"
            label="Nom affiché"
            maxLength={200}
            defaultValue={defaults.display_name}
            hint="Facultatif : calculé à partir du nom et du prénom, ou de la raison sociale."
          />
          <Field id="email" label="E-mail" type="email" maxLength={254} defaultValue={defaults.email} />
          <Field id="phone" label="Téléphone" maxLength={30} defaultValue={defaults.phone} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <input
              id="is_proxy_ineligible"
              name="is_proxy_ineligible"
              type="checkbox"
              className="size-4"
              defaultChecked={defaults.is_proxy_ineligible}
            />
            <Label htmlFor="is_proxy_ineligible">
              Ne peut pas recevoir de pouvoir (non éligible mandataire)
            </Label>
          </div>
        </fieldset>

        <fieldset disabled={disabled} className="flex flex-col gap-3">
          <legend className="mb-2 font-medium">Voix</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            {keys.map((k) => (
              <Field
                key={k.code}
                id={`weight_${k.code}`}
                label={k.label}
                inputMode="decimal"
                defaultValue={defaults.weights[k.code] ?? "0"}
              />
            ))}
          </div>
        </fieldset>

        {state.error && (
          <Alert variant="destructive">
            {state.error}
            {state.details && (
              <ul className="mt-2 list-inside list-disc">
                {state.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        {!disabled && (
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        )}
      </form>

      {memberId && !disabled && (
        <div className="border-border flex flex-col gap-2 border-t pt-4">
          <div>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                if (!window.confirm("Supprimer ce membre et ses voix ? L'opération est tracée.")) return;
                startDelete(async () =>
                  setDeleteError((await deleteMember(orgId, assemblyId, memberId)).error),
                );
              }}
            >
              Supprimer le membre
            </Button>
          </div>
          {deleteError && <Alert variant="destructive">{deleteError}</Alert>}
        </div>
      )}
    </div>
  );
}
