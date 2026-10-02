"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

// Produit un export et le télécharge ; affiche son empreinte SHA-256 (consignée au journal).
export function ExportButton({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ sha256?: string; error?: string }>();

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(undefined);
            const response = await fetch(href);
            if (!response.ok) {
              setResult({ error: await response.text() });
              return;
            }
            const blob = await response.blob();
            const name =
              /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "export";
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = name;
            link.click();
            URL.revokeObjectURL(url);
            setResult({ sha256: response.headers.get("X-Export-Sha256") ?? undefined });
            router.refresh();
          })
        }
      >
        {pending ? "Génération…" : label}
      </Button>
      {result?.sha256 && (
        <p className="text-muted-foreground font-mono text-xs break-all" data-testid="export-sha">
          SHA-256 : {result.sha256}
        </p>
      )}
      {result?.error && <p className="text-destructive text-xs">{result.error}</p>}
    </div>
  );
}
