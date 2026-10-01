"use client";

import { useActionState } from "react";
import { createAssembly, type FormState } from "@/app/(admin)/orgs/[orgId]/assemblies/new/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AssemblyInfoFields } from "./assembly-info-fields";

export function CreateAssemblyForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAssembly.bind(null, orgId), {});

  return (
    <form action={action} className="flex flex-col gap-6">
      <AssemblyInfoFields />
      <p className="text-muted-foreground text-sm">
        Les règles de quorum et de pouvoirs sont pré-remplies selon l&apos;organisme, la forme et le type
        d&apos;assemblée. Vous les vérifierez à l&apos;étape suivante, au regard des statuts.
      </p>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Créer l'assemblée"}
        </Button>
      </div>
    </form>
  );
}
