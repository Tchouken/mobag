// Code de vote : 16 caractères en alphabet Crockford. Miroir de private.normalize_code
// (supabase/migrations/20261002000011_voter_identity.sql).

export const CODE_LENGTH = 16;
const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]+$/;

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function isCompleteCode(raw: string): boolean {
  const code = normalizeCode(raw);
  return code.length === CODE_LENGTH && CROCKFORD.test(code);
}

// Affichage par groupes de 4 : ABCD-EFGH-JKMN-PQRS.
export function formatCode(code: string): string {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

// Lien d'association : le code est dans le fragment (#), jamais envoyé au serveur.
export function voterLink(origin: string, code: string): string {
  return `${origin}/v#${normalizeCode(code)}`;
}

// Code lu dans un QR : lien d'association (même d'un autre domaine de l'appli) ou code seul.
export function extractCode(scanned: string): string | null {
  const text = scanned.trim();
  const fromLink = text.match(/\/v#([0-9A-Za-z-]+)$/);
  const candidate = fromLink ? fromLink[1]! : text;
  return isCompleteCode(candidate) ? normalizeCode(candidate) : null;
}
