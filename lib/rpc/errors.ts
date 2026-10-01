// Traduction des codes d'erreur métier renvoyés par les RPC (private.fail) et des
// erreurs Postgres courantes. Le code SQL est stable ; seul le libellé est ici.
const MESSAGES: Record<string, string> = {
  forbidden: "Vous n'avez pas les droits nécessaires pour cette action.",
  not_found: "Élément introuvable.",
  invalid_slug:
    "Identifiant invalide : lettres minuscules, chiffres et tirets uniquement (ex. « syndic-dupont »).",
  slug_taken: "Cet identifiant est déjà utilisé par une autre organisation.",
  invalid_email: "Adresse e-mail invalide.",
  invalid_ttl: "La durée de validité doit être comprise entre 1 et 30 jours.",
  already_member: "Cette personne est déjà membre de l'organisation.",
  invitation_pending: "Une invitation est déjà en attente pour cette adresse.",
  invitation_closed: "Cette invitation a déjà été utilisée ou révoquée.",
  invitation_expired: "Cette invitation a expiré. Demandez-en une nouvelle à l'administrateur.",
  invitation_email_mismatch:
    "Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec l'adresse invitée.",
  last_org_admin: "L'organisation doit conserver au moins un administrateur.",
  append_only: "Cet enregistrement est protégé et ne peut pas être modifié.",
};

const FALLBACK = "Une erreur inattendue est survenue. Réessayez ou contactez le support.";

export type RpcError = { message?: string | null; code?: string | null } | null | undefined;

export function rpcErrorCode(error: RpcError): string | null {
  if (!error) return null;
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "42501") return "forbidden";
  return null;
}

export function rpcErrorMessage(error: RpcError): string {
  const code = rpcErrorCode(error);
  return (code && MESSAGES[code]) || FALLBACK;
}
