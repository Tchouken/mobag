import type { Instrumentation } from "next";

// Erreurs serveur : une ligne JSON par erreur dans les journaux (Vercel), sans données de
// requête sensibles (ni cookies, ni en-têtes, ni corps). Point de branchement de Sentry
// (DECISIONS : compte à créer).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err as { message?: string; digest?: string; name?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      name: error.name,
      message: error.message,
      digest: error.digest,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      type: context.routeType,
    }),
  );
};
