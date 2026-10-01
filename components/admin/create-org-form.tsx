"use client";

import { useActionState } from "react";
import { createOrganization, type FormState } from "@/app/(admin)/orgs/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateOrgForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrganization, {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
      <div className="flex flex-col gap-2">
        <Label htmlFor="org-name">Nom du client</Label>
        <Input id="org-name" name="name" required maxLength={200} placeholder="Cabinet Dupont Syndic" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="org-slug">Identifiant (facultatif)</Label>
        <Input id="org-slug" name="slug" maxLength={60} placeholder="cabinet-dupont" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer"}
      </Button>
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-3">
          {state.error}
        </Alert>
      )}
    </form>
  );
}
