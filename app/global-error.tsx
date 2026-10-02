"use client";

// Erreur dans la mise en page racine : page minimale autonome.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1>Une erreur est survenue</h1>
        <p>Les votes et émargements déjà confirmés sont enregistrés. Réessayez dans un instant.</p>
        <button type="button" onClick={reset} style={{ padding: "0.75rem 1.5rem", fontSize: "1rem" }}>
          Réessayer
        </button>
        {error.digest && <p style={{ fontSize: "0.75rem" }}>Référence : {error.digest}</p>}
      </body>
    </html>
  );
}
