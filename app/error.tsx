"use client";

import { Button } from "@/components/ui/button";

// Erreur inattendue d'une page : message neutre, nouvel essai, référence pour le support.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Une erreur est survenue</h1>
      <p className="text-muted-foreground">
        Rien n&apos;a été perdu : les votes et émargements déjà confirmés sont enregistrés. Réessayez ; si
        l&apos;erreur persiste, prévenez l&apos;équipe MobilActif.
      </p>
      <div>
        <Button size="lg" onClick={reset}>
          Réessayer
        </Button>
      </div>
      {error.digest && <p className="text-muted-foreground text-xs">Référence : {error.digest}</p>}
    </main>
  );
}
