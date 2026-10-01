"use client";

import { useRef, useState, useTransition } from "react";
import {
  attachProxyDocument,
  proxyDocumentUrl,
  revokeProxy,
} from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/proxies/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

type Props = {
  orgId: string;
  assemblyId: string;
  proxyId: string;
  grantorLabel: string;
  documentPath: string | null;
  live: boolean;
  editable: boolean;
};

export function ProxyRowActions({
  orgId,
  assemblyId,
  proxyId,
  grantorLabel,
  documentPath,
  live,
  editable,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  const viewDocument = () =>
    startTransition(async () => {
      const result = await proxyDocumentUrl(documentPath!);
      if (result.url) window.open(result.url, "_blank", "noopener");
      else setError(result.error);
    });

  const upload = (file: File) =>
    startTransition(async () => {
      setError(undefined);
      if (!DOC_TYPES[file.type] || file.size > 10 * 1024 * 1024) {
        setError("PDF, JPEG ou PNG de 10 Mo au plus.");
        return;
      }
      const objectPath = `${assemblyId}/${proxyId}/${crypto.randomUUID()}.${DOC_TYPES[file.type]}`;
      const { error: uploadError } = await createClient()
        .storage.from("proxy-documents")
        .upload(objectPath, file, { contentType: file.type });
      if (uploadError) {
        setError("Dépôt du scan impossible.");
        return;
      }
      const result = await attachProxyDocument(orgId, assemblyId, proxyId, objectPath);
      setError(result.error);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {documentPath && (
          <Button variant="outline" size="sm" disabled={pending} onClick={viewDocument}>
            Voir le scan
          </Button>
        )}
        {editable && live && !documentPath && (
          <>
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              aria-label={`Scan du pouvoir de ${grantorLabel}`}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
              Joindre le scan
            </Button>
          </>
        )}
        {editable && live && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt(`Révoquer le pouvoir de ${grantorLabel} ? Motif :`);
              if (reason === null) return;
              startTransition(async () =>
                setError((await revokeProxy(orgId, assemblyId, proxyId, reason)).error),
              );
            }}
          >
            Révoquer
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
