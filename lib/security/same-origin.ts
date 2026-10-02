// Protection CSRF des routes qui écrivent : la requête doit venir de l'application elle-même
// (en-tête Origin, ou à défaut Sec-Fetch-Site). Les actions serveur de Next.js le font déjà.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
