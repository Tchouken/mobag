# Runbook — jour de l'AG (brouillon Lot 1)

Procédure de l'équipe MobilActif pour une AG en présentiel. À relire avec le client ; la
répartition des rôles dépend de la réponse à la question Q6 (qui opère la régie). Les points
marqués ⚠ dépendent de comptes et réglages de production à finaliser (DECISIONS B6, B9, Q2).

## J-7 à J-1

- [ ] AG **convoquée** dans MobAG ; règles relues (quorum, majorités, pouvoirs) et modèles de
      règles validés par un juriste pour ce type d'AG (Q7).
- [ ] Membres importés, totaux par clé égaux aux totaux déclarés ; résolutions relues ; avis du
      conseil saisis (SA avec pouvoirs en blanc).
- [ ] Pouvoirs reçus saisis ou importés ; aucun rejet en attente.
- [ ] Bureau désigné dans « Bureau et accueil » (président, secrétaire, scrutateurs) et comptes
      d'accueil invités ; chacun s'est connecté une fois.
- [ ] Répétition sur la démonstration (`npm run db:demo`) ou une AG de test : émargement, vote,
      clôture, validation, exports.
- [ ] ⚠ Production : quota de connexions Realtime relevé pour le nombre de votants attendus (Q2) ;
      `pg_cron` actif ; sessions anonymes actives et limite relevée (`anonymous_users`), car tous
      les votants partagent l'adresse IP de la salle ; sauvegardes et PITR vérifiés.
- [ ] Gel des déploiements opérationnel : `https://<domaine>/api/health` répond et la variable
      GitHub `PRODUCTION_HEALTH_URL` est renseignée (le gel s'active seul 12 h avant la séance).
- [ ] Matériel : tablettes d'accueil chargées (navigateur à jour, écran de veille long), tablettes
      de prêt numérotées, ordinateur de régie, ordinateur de projection, routeur 4G de secours.

## Le jour J, avant l'ouverture des portes

1. **Réseau** : Wi-Fi de la salle testé depuis un smartphone (ouvrir `/api/health`) ; routeur 4G
   prêt.
2. **Accueil** : sur chaque tablette, ouvrir `/accueil/<AG>` (bouton « Ouvrir l'accueil ») ; le
   badge en tête doit indiquer « Temps réel ».
3. **Régie** : ouvrir `/regie/<AG>` ; vérifier quorum par clé et ordre du jour.
4. **Projection** : depuis la régie, « Écran de projection » → ouvrir le lien sur l'ordinateur de
   projection, « Plein écran ». Un nouveau lien invalide le précédent.

## Accueil

- Rechercher la personne (nom, référence, représentant). Faire **signer**, valider l'émargement.
- **Appareil de vote** : « QR pour son smartphone » (la personne scanne avec l'appareil photo) ou
  « Prêter une tablette » (saisir le code sur la tablette, écran « Associer cet appareil »). Le code
  n'est affiché qu'une fois ; en cas de doute, en émettre un nouveau (l'ancien est révoqué).
- **Pouvoir apporté le jour même** : « Pouvoir reçu » sur la fiche du mandataire.
- **Départ** : définitif (voix confiées à une personne présente), absence temporaire (retour
  prévu) ou sans transmission. Si un plafond bloque, le message l'explique : choisir une autre
  personne, ou dérogation par un membre du bureau (motif obligatoire).
- **Retour** : « Enregistrer son retour ». **Tablette rendue** : bouton sur la fiche.
- Personne absente de la liste : « Personne non prévue » (mandataire tiers, invité).

## Séance

1. Régie : **Ouvrir la séance** (le quorum s'affiche par clé).
2. Pour chaque résolution : lire le texte, **Ouvrir le vote** (minuteur facultatif). Suivre la
   participation ; « Relancer les retardataires » si besoin ; **Clore le vote**.
3. Contrôler le résultat provisoire (décompte, conditions de majorité) ; la présidence **valide** :
   le résultat apparaît sur l'écran de projection.
4. Erreur ou incident pendant un vote (mauvais texte, panne) : « Annuler ce vote », motif
   obligatoire, puis rouvrir un nouveau vote. L'ancien reste dans l'historique et les exports.
5. Correction en séance : poids d'un membre ou texte d'une résolution non encore votée, par le
   bureau, motif obligatoire (tracé). Une résolution votée ne change plus.
6. Fin : **Clore la séance** (impossible tant qu'un vote est ouvert) ; l'AG passe en lecture seule.

## Incidents

| Situation                                                  | Conduite à tenir                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badge « Actualisation toutes les 3 s »                     | Temps réel indisponible : les écrans continuent par relecture. Rien à faire ; si le réseau est en cause, basculer sur le routeur 4G.                                                                                                                                      |
| Un votant n'a plus accès (téléphone éteint, changé)        | Accueil : émettre un nouveau code (l'ancien appareil est dissocié) ou prêter une tablette.                                                                                                                                                                                |
| « Ce code est déjà utilisé sur un autre appareil »         | Code photographié ou transmis : émettre un nouveau code à la personne, après vérification de son identité.                                                                                                                                                                |
| Vote affiché « Connexion difficile »                       | L'envoi est rejoué automatiquement (sans risque de double vote). Si la page est rechargée, l'envoi reprend. « Vote enregistré » n'apparaît qu'une fois le vote en base.                                                                                                   |
| Départ pendant un vote                                     | Les voix non encore exprimées suivent la personne qui les reçoit ; sans transmission, elles restent dans la base du vote sans être exprimées.                                                                                                                             |
| Panne générale de l'électronique (mode dégradé, SPEC §7.2) | Ce qui est voté est conservé. Le bureau annule le vote en cours (motif « panne ») et procède à main levée ou sur papier selon le règlement de l'AG ; le résultat est consigné au procès-verbal par le bureau. La saisie de la main levée dans MobAG arrive au Lot 2 (B5). |
| Résultat contesté                                          | Exports « Résultats » (tous les tours, motifs d'annulation) et empreinte des votes ; vérification d'intégrité par un administrateur (`verify_audit_chain`).                                                                                                               |

## Après la séance

- Exports : feuille de présence (PDF signé + tableur) et résultats (PDF, tableur, CSV). Chaque
  document est conservé avec son empreinte SHA-256 (onglet « Exports »).
- Remettre au secrétaire de séance la feuille de présence à certifier (bloc de signatures du bureau).
- Récupérer les tablettes de prêt (« Tablette rendue »).
- Le gel des déploiements se lève de lui-même 12 h après l'heure de début si l'AG est close.

## En cas d'urgence technique

- Correctif à déployer pendant une AG : poser le libellé `gel-leve` sur la PR et
  `DEPLOY_FREEZE_OVERRIDE=1` sur Vercel, après accord du responsable de l'AG.
- ⚠ Restauration : procédure Supabase PITR à rédiger et tester sur le projet de production (B6).
