# Note de fin de Lot 1 — MobAG (MA-Vote)

Branche `claude/brave-galileo-naqqpf`, 2 octobre 2026. Périmètre : SPEC §8, « Lot 1 — Socle et
vote en présentiel », selon le plan validé (`docs/PLAN_LOT1.md`, tâches T0 à T18).

## Ce qui est livré

| Domaine                  | Contenu                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Socle                    | Next.js 16, Supabase (UE), RLS en lecture seule partout, écritures par RPC uniquement, journal d'audit chaîné en ajout seul, CI (format, lint, types, unitaires, build, migrations, pgTAP, intégration, E2E)                                                                                                                                                                 |
| Comptes et organisations | Connexion par lien magique, organisations, invitations, rôles (super-admin, administrateur, organisateur), isolation entre organisations testée                                                                                                                                                                                                                              |
| Préparation d'une AG     | Règles paramétrables (quorum, majorités, pouvoirs, réglages) validées en SQL et en Zod, modèles de règles (sociétés, associations, génériques), clés de répartition, import CSV/XLSX de 20 000 lignes, résolutions (texte riche, versions, pièces jointes, glisser-déposer), pouvoirs (saisie, import, scans, plafonds « et / ou », dérogation du bureau), bureau et accueil |
| Accueil                  | Tablette : recherche, émargement signé, QR du smartphone ou tablette prêtée, pouvoir reçu, départs (transmission, absence temporaire, sortie) et retours, personne non prévue                                                                                                                                                                                                |
| Séance                   | Régie : quorum par clé, terminaux connectés, ouverture et clôture du vote, base figée, minuteur, relance, participation sans tendance, résultat exact, validation par la présidence, annulation motivée et nouveau vote, verrous de séance et corrections du bureau tracées                                                                                                  |
| Vote                     | Écran mobile accessible : même vote ou vote par mandant, confirmation, envoi idempotent avec réessais et reprise, « enregistré » sur confirmation du serveur ; vote secret (modèle §7.3)                                                                                                                                                                                     |
| Temps réel               | Broadcast sur canaux privés, repli en relecture toutes les 3 s                                                                                                                                                                                                                                                                                                               |
| Projection               | Écran public par lien à jeton : quorum, vote en cours, résultat validé                                                                                                                                                                                                                                                                                                       |
| Exports                  | Feuille de présence signée (PDF, tableur) et résultats (PDF, tableur, CSV), empreinte SHA-256 et journal                                                                                                                                                                                                                                                                     |
| Démonstration            | SA de 40 actionnaires, association de 1 500 adhérents, copropriété de 120 lots (`npm run db:demo`)                                                                                                                                                                                                                                                                           |
| Durcissement             | CSP à nonce, HSTS, routes d'écriture en POST avec contrôle d'origine, pages d'erreur, journalisation des erreurs serveur, gel des déploiements le jour d'une AG (Vercel et GitHub), santé publique `/api/health`                                                                                                                                                             |
| Documentation            | README, `ARCHITECTURE.md`, `RUNBOOK_JOUR_J.md`, `DECISIONS.md`, rapport de charge                                                                                                                                                                                                                                                                                            |

## Tests (dernière exécution)

| Suite                                                                       | Résultat                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| pgTAP (fonctions SQL, droits, isolation)                                    | **548 tests**, 17 fichiers, tous verts                                                                               |
| Unitaires (Vitest)                                                          | **133 tests**, 14 fichiers, tous verts                                                                               |
| Intégration (Postgres réel : concurrence, import massif, parité des règles) | **57 tests**, 4 fichiers, tous verts                                                                                 |
| Parcours complet (Playwright, `e2e/`)                                       | vert, en développement et sur la version de production (CSP stricte)                                                 |
| Charge (k6)                                                                 | 2 000 votants à 250 votes/s en local (jetons HS256) : p95 432 ms, p99 720 ms, 0 erreur ; voir les limites ci-dessous |
| Lint SQL (`supabase db lint`), ESLint, TypeScript, Prettier                 | sans erreur                                                                                                          |

Les propriétés critiques sont testées en parallèle réel et par mutation : plafonds de pouvoirs
avec deux postes d'accueil, aucun vote après la clôture, un seul vote sous envois concurrents,
réessais sans double vote.

## Ce qui n'est pas fait, ou pas vérifié

- **Prévisualisation Vercel** : non déployée. Aucun projet Supabase hébergé n'existe encore (B6) ;
  une prévisualisation sans base serait inutilisable. Étapes prêtes (README, « Déploiement »).
- **CI GitHub** : les workflows sont écrits mais n'ont jamais tourné sur la branche (aucune
  exécution visible) ; à surveiller à la première PR.
- **Charge en préproduction** : l'objectif de 500 votes/s n'est pas atteint en local. Le goulot
  identifié est la vérification des jetons ES256 par PostgREST (B9). La mesure sur l'offre Supabase
  visée est indispensable avant une AG réelle (`docs/lots/CHARGE_LOT1.md`).
- **Sentry** : point de branchement prêt (`instrumentation.ts`), compte à créer.
- **Procédure de restauration (PITR)** : à rédiger et tester sur le projet de production.
- **Mode dégradé** : procédure papier dans le runbook ; saisie de la main levée au Lot 2 (B5).

## Décisions attendues

| Réf. | Sujet                                                 | Pourquoi c'est important                                                                                |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| B6   | Comptes Supabase (UE, Pro) et Vercel                  | Prévisualisation, préproduction, charge, PITR                                                           |
| B9   | Charge : jetons ES256 vérifiés par l'API              | Choisir entre taille d'instance, clé HS256 ou votes par fonction serveur, après mesure en préproduction |
| Q2   | Taille maximale d'une AG                              | Quota de connexions Realtime à relever (2 000 appareils)                                                |
| Q6   | Qui opère le jour J                                   | Répartition des rôles dans le runbook                                                                   |
| Q7   | Validation juridique des modèles de règles            | Indispensable avant toute AG réelle, dont les majorités de copropriété saisies en démonstration         |
| B8   | Rôle d'accueil restreint pour le personnel temporaire | Aujourd'hui, l'accueil est un rôle de séance par AG                                                     |

## Pistes pour le Lot 2

Convocations et relances par e-mail, formulaire de mandataire en ligne, votes par
correspondance, procès-verbal DOCX et archive scellée, main levée et vote assisté, élections et
choix multiples, AG de répétition et duplication, marque blanche.
