"use client";

import { useRef, useState, useTransition } from "react";
import {
  attachmentUrl,
  registerAttachment,
  removeAttachment,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/resolutions/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/browser";

type Attachment = { id: string; filename: string; size_bytes: number; path: string };

const MAX_BYTES = 20 * 1024 * 1024;
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

export function AttachmentsPanel({
  orgId,
  assemblyId,
  resolutionId,
  attachments,
  editable,
}: {
  orgId: string;
  assemblyId: string;
  resolutionId: string;
  attachments: Attachment[];
  editable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  const upload = (file: File) =>
    startTransition(async () => {
      setError(undefined);
      if (file.type !== "application/pdf") return setError("Seuls les fichiers PDF sont acceptés.");
      if (file.size > MAX_BYTES) return setError("Le fichier dépasse 20 Mo.");
      // Dépôt direct dans Storage (politiques RLS), puis enregistrement en base.
      const path = `${assemblyId}/${resolutionId}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await createClient()
        .storage.from("attachments")
        .upload(path, file, { contentType: "application/pdf" });
      if (uploadError) return setError("Le dépôt du fichier a échoué.");
      const result = await registerAttachment(orgId, assemblyId, resolutionId, path, file.name);
      if (result.error) setError(result.error);
      if (input.current) input.current.value = "";
    });

  const download = (path: string) =>
    startTransition(async () => {
      const result = await attachmentUrl(path);
      if (result.url) window.location.assign(result.url);
      else setError(result.error);
    });

  return (
    <div className="flex flex-col gap-4">
      {attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune pièce jointe.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {a.filename} <span className="text-muted-foreground text-sm">({size(a.size_bytes)})</span>
              </span>
              <span className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pending} onClick={() => download(a.path)}>
                  Télécharger
                </Button>
                {editable && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Retirer « ${a.filename} » ?`)) return;
                      startTransition(async () =>
                        setError((await removeAttachment(orgId, assemblyId, resolutionId, a.id)).error),
                      );
                    }}
                  >
                    Retirer
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="attachment">Ajouter un PDF (20 Mo maximum)</Label>
          <input
            ref={input}
            id="attachment"
            type="file"
            accept="application/pdf"
            disabled={pending}
            className="file:border-border file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
      )}
      {pending && (
        <p className="text-muted-foreground text-sm" role="status">
          Traitement…
        </p>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
