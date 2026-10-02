"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { rpcErrorMessage } from "@/lib/rpc/errors";
import type { createClient } from "@/lib/supabase/browser";

// Lien de l'écran de projection : généré à la demande (le précédent cesse alors de fonctionner),
// affiché une seule fois, à ouvrir sur l'ordinateur relié au vidéoprojecteur.
export function ProjectionLink({
  supabase,
  assemblyId,
}: {
  supabase: ReturnType<typeof createClient>;
  assemblyId: string;
}) {
  const [link, setLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const issue = () => {
    if (!window.confirm("Générer un lien de projection ? Le lien précédent cessera de fonctionner.")) return;
    startTransition(async () => {
      setError(undefined);
      setCopied(false);
      const { data, error: rpcError } = await supabase.rpc("rotate_projection_token", {
        p_assembly: assemblyId,
      });
      if (rpcError || !data) setError(rpcErrorMessage(rpcError));
      else setLink(`${window.location.origin}/projection#${data}`);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={issue}>
        Écran de projection
      </Button>
      {link && (
        <div className="border-border flex max-w-md flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
          <code className="break-all" data-testid="projection-link">
            {link}
          </code>
          <a href={link} target="_blank" rel="noreferrer" className="underline">
            Ouvrir
          </a>
          <button
            type="button"
            className="underline"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          >
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
