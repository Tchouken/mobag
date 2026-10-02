import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { contentSecurityPolicy, newNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

// Espaces réservés au personnel (comptes e-mail). Les votants (sessions anonymes, T8)
// et l'écran de projection ont leurs propres routes.
const STAFF_PREFIXES = ["/orgs", "/invitations", "/accueil", "/regie"];

export async function proxy(request: NextRequest) {
  // CSP à nonce : transmise à Next.js (qui l'applique à ses scripts) puis renvoyée au navigateur.
  const csp = contentSecurityPolicy(
    newNonce(),
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    process.env.NODE_ENV === "development",
  );
  request.headers.set("Content-Security-Policy", csp);
  const { response, user } = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  const { pathname, search } = request.nextUrl;

  const isStaffRoute = STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isStaffRoute && (!user || user.is_anonymous)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
