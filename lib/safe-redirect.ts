// N'accepte qu'un chemin interne : évite les redirections ouvertes après connexion.
export function safeNextPath(raw: string | null | undefined, fallback = "/orgs"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
