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
  assembly_locked: "L'assemblée est en séance ou close : sa préparation n'est plus modifiable.",
  version_conflict:
    "Cette assemblée a été modifiée entre-temps par quelqu'un d'autre. Rechargez la page pour voir la dernière version.",
  invalid_title: "Le titre est obligatoire (200 caractères maximum).",
  invalid_legal_family: "Type d'organisme invalide.",
  invalid_legal_form: "La forme juridique ne s'applique qu'aux sociétés.",
  invalid_timezone: "Fuseau horaire inconnu.",
  invalid_starts_at: "La date et l'heure de l'assemblée sont obligatoires.",
  invalid_quorum_rule: "La règle de quorum est invalide.",
  invalid_proxy_rules: "Les règles de pouvoirs sont invalides.",
  invalid_settings: "Les réglages de séance sont invalides.",
  unknown_preset: "Ce modèle de règle n'existe pas.",
  transition_not_available: "Ce changement de statut n'est pas possible depuis le statut actuel.",
  invalid_code: "Code invalide : lettres minuscules, chiffres et « _ » uniquement (30 caractères maximum).",
  invalid_label: "Le libellé est obligatoire (100 caractères maximum).",
  invalid_total: "Le total déclaré doit être strictement positif.",
  code_taken: "Ce code est déjà utilisé par une autre clé de cette assemblée.",
  primary_key_required:
    "Une assemblée a toujours une clé principale : désignez-en une autre avant de retirer celle-ci.",
  not_org_member: "Seuls les membres de l'organisation peuvent être désignés.",
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
