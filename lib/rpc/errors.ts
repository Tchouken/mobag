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
  invalid_import_mode: "Mode d'import inconnu.",
  invalid_import_rows: "Données d'import invalides.",
  empty_import: "Le fichier ne contient aucune ligne à importer.",
  too_many_rows: "Le fichier dépasse 20 000 lignes.",
  invalid_member: "Les informations du membre sont invalides.",
  ref_exists: "Cette référence est déjà utilisée par un autre membre de l'assemblée.",
  weight_key_in_use:
    "Cette clé est utilisée (voix de membres ou résolutions) : retirez ces usages avant de la supprimer.",
  invalid_resolution: "Les informations de la résolution sont invalides.",
  vote_type_not_available: "Ce type de vote n'est pas encore disponible.",
  invalid_majority_rule: "La règle de majorité est invalide.",
  invalid_weight_key: "Clé de répartition invalide.",
  invalid_parent: "Rattachement impossible : un seul niveau de sous-résolutions est autorisé.",
  reason_required: "L'assemblée a été convoquée : indiquez le motif de la modification.",
  has_children: "Supprimez d'abord les sous-résolutions.",
  invalid_order: "L'ordre du jour a changé entre-temps : rechargez la page.",
  invalid_attachment: "Pièce jointe invalide.",
  attachment_not_uploaded: "Le fichier n'a pas été reçu : recommencez le dépôt.",
  proxy_exists: "Ce membre a déjà donné un pouvoir : révoquez-le d'abord.",
  grantor_present: "Ce membre est présent : il vote lui-même et ne peut pas donner de pouvoir.",
  blank_proxy_not_allowed: "Les pouvoirs en blanc ne sont pas admis pour cette assemblée.",
  invalid_proxy_type: "Type de pouvoir invalide.",
  proxy_rule_violation: "Ce pouvoir enfreint les règles de l'assemblée.",
  proxy_revoked: "Ce pouvoir est déjà révoqué.",
  member_already_embodied: "Ce membre est déjà rattaché à une autre personne.",
  invalid_name: "Le nom est obligatoire.",
  attendee_present: "Cette personne est présente : ses membres ne peuvent plus être modifiés.",
  member_in_use: "Ce membre est lié à une personne ou à un pouvoir : il ne peut pas être supprimé.",
  attendee_not_expected: "Cette personne a déjà émargé.",
  attendee_not_present: "Cette personne n'est pas présente.",
  attendee_not_left: "Cette personne n'est pas sortie.",
  invalid_transfer_target: "Destinataire invalide.",
  transfer_target_not_present: "Le destinataire doit être présent en salle.",
  invalid_mode: "Mode invalide.",
  invalid_signature: "Signature invalide.",
  no_members: "L'assemblée n'a aucun participant.",
  holder_not_found: "Mandataire introuvable.",
  invalid_holder: "Indiquez le mandataire.",
  grantor_not_found: "Mandant introuvable.",
  missing_holder: "Mandataire non renseigné.",
  invalid_document: "Document invalide.",
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
