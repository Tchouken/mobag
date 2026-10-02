// Content-Security-Policy (SPEC §7.3). Scripts : uniquement ceux de l'application, porteurs du
// nonce de la requête (Next.js l'applique à ses propres scripts) ; connexions : l'application et
// le projet Supabase (API et temps réel) ; aucune intégration dans un cadre tiers.
export function contentSecurityPolicy(nonce: string, supabaseUrl: string, isDev: boolean): string {
  const api = new URL(supabaseUrl);
  const realtime = `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`;
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Attributs style (largeurs de jauges) : non couverts par les nonces.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${api.origin} ${realtime}${isDev ? " ws:" : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function newNonce(): string {
  return btoa(crypto.randomUUID());
}
