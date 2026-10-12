# MobAG — plan de mise en production

Rédigé le 12 octobre 2026, après la signature du contrat FEDE (AG du 14 avril 2027, environ
200 votants). Ce document résume ce qui existe, ce qu'on peut vendre, l'hébergement de production
recommandé et ce qui reste à faire, avec un calendrier jusqu'à l'AG.

## 1. Ce qui existe et fonctionne (Lot 1)

Détail : `docs/lots/LOT1_NOTE.md`. Tout est testé : 548 tests SQL, 133 unitaires, 57
d'intégration (concurrence réelle), parcours complet automatisé.

| Domaine              | Ce qui marche aujourd'hui                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Comptes              | Connexion par lien e-mail, organisations clientes isolées, invitations, rôles (administrateur, organisateur)         |
| Préparation d'une AG | Règles paramétrables (quorum, majorités, plafonds de pouvoirs), import Excel/CSV des membres (20 000 lignes), droits |
| Pouvoirs             | Saisie, import, plafonds contrôlés en base, dérogation tracée                                                        |
| Accueil (tablette)   | Recherche, émargement signé, QR de vote pour le smartphone ou tablette prêtée, départs et retours                    |
| Régie                | Quorum en direct, ouverture et clôture des votes, minuteur, résultat exact, validation par la présidence, annulation |
| Vote                 | Écran mobile : oui / non / abstention, vote pour ses mandants, envoi sûr (jamais de double vote), vote secret        |
| Projection           | Écran public : quorum, vote en cours, résultat validé                                                                |
| Exports              | Feuille de présence signée, résultats en PDF, Excel et CSV, avec empreinte d'intégrité                               |
| Sécurité             | Base seule source de vérité, journal d'audit chaîné et infalsifiable, gel des déploiements le jour d'une AG          |

En ligne aujourd'hui : `https://mobag.vercel.app` sur un projet Supabase de test. **Ce n'est pas
encore une production** : offre gratuite, pas de sauvegarde à la minute, e-mails limités, aucun
domaine MobilActif.

## 2. Ce qu'on peut proposer commercialement

| Offre                                           | Statut                           | Clients types                                  |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| Vote de résolutions en AG présentielle          | **Vendable dès la mise en prod** | Associations, sociétés (SA, SAS), copropriétés |
| Émargement électronique et feuille de présence  | **Vendable dès la mise en prod** | Toute AG avec liste d'émargement               |
| Gestion des pouvoirs avec plafonds              | **Vendable dès la mise en prod** | Copropriétés, associations, fédérations        |
| Élections de candidats par section (type FEDE)  | Lot 2, prêt début 2027           | Fédérations, syndicats, CSE, ordres            |
| Interface votant bilingue FR / EN               | Lot 2, prêt début 2027           | Organisations internationales                  |
| Vote par correspondance et à distance           | Plus tard (Lot 2 ou 3)           | AG hybrides                                    |
| Convocations et relances par e-mail, PV en Word | Plus tard (Lot 2)                | Toutes                                         |

Argumentaire : résultats calculés et scellés côté serveur (aucun calcul dans le navigateur),
journal d'audit infalsifiable, données hébergées en France, tablettes de prêt et technicien sur
place, répétition à blanc incluse.

Limites à ne pas promettre aujourd'hui : plus de 500 votants simultanés sans test de charge sur la
production (voir `docs/lots/CHARGE_LOT1.md`), vote à distance, signature électronique qualifiée,
modèles de majorités validés par un juriste (à faire avant toute AG de copropriété ou de société).

## 3. Hébergement de production recommandé (« le plus sûr »)

Principe : un projet de **production** séparé et neuf. Le projet actuel (`idkxloihztxphcnyfoaw`)
devient la **préproduction** (tests, démonstrations, répétitions).

| Brique        | Choix                                                                                                                  | Coût indicatif (à vérifier sur les grilles) |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Base, comptes | Supabase **Pro**, nouveau projet en région **Paris (eu-west-3)**, instance Small, puis Medium ou Large le mois de l'AG | 25 $ + 15 à 60 $ / mois                     |
| Sauvegardes   | **PITR 7 jours** (restauration à la seconde près) en plus des sauvegardes quotidiennes                                 | ~100 $ / mois                               |
| Application   | Vercel **Pro** (obligatoire pour un usage commercial), région Paris `cdg1`                                             | 20 $ / utilisateur / mois                   |
| Domaine       | `vote.mobilactif.fr` (HTTPS automatique)                                                                               | inclus                                      |
| E-mails       | Brevo en SMTP, domaine `mobilactif.fr` authentifié (SPF, DKIM, DMARC)                                                  | gratuit à 300 / jour, ~9 € / mois au-delà   |
| Supervision   | Sentry (région UE) pour les erreurs, sonde de disponibilité sur `/api/health`                                          | 0 à 26 $ / mois                             |
| Option        | Supabase **Team** si un client exige un rapport SOC 2, SSO ou des journaux de 28 jours                                 | 599 $ / mois                                |

Budget récurrent : **environ 180 à 250 € HT par mois** hors option Team. Il est possible de
n'augmenter la taille de la base que le mois d'une AG.

Mesures de sécurité qui ne coûtent rien et sont obligatoires :

- Double authentification (MFA) sur Supabase, Vercel, GitHub et Brevo ; deux administrateurs
  MobilActif minimum, pas de compte partagé.
- Clés secrètes uniquement dans les réglages Supabase et Vercel, jamais dans le code ni dans une
  conversation. **La clé API Brevo collée le 9 octobre doit être révoquée et recréée.**
- Branche `main` protégée : la production ne se déploie que depuis `main`, après revue et tests
  verts (CI GitHub déjà écrite).
- Contrats de sous-traitance RGPD (DPA) Supabase, Vercel, Brevo signés ; registre des traitements
  et mentions d'information des votants.
- Restauration testée une fois avant l'AG (procédure à écrire dans `RUNBOOK_JOUR_J.md`).
- Option recommandée avant la première grosse AG : test d'intrusion par un prestataire externe.

## 4. Étapes de mise en production

| #   | Étape                                                                                                                   | Qui                    | Durée  |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| 1   | Passer l'organisation Supabase en Pro, créer le projet `mobag-prod` (Paris), activer PITR, `pg_cron`, sessions anonymes | Thibaut                | 30 min |
| 2   | Appliquer les 19 migrations (`npx supabase link` puis `db push`) ; vérifier les tests SQL sur la préproduction          | Claude + Thibaut       | 1 h    |
| 3   | Créer le compte super-administrateur MobilActif (inscription en base, une ligne SQL fournie)                            | Claude + Thibaut       | 15 min |
| 4   | SMTP Brevo (clé neuve), modèles d'e-mails en français, URL du site et de redirection                                    | Thibaut, textes Claude | 1 h    |
| 5   | Vercel Pro, projet de production relié à `main`, variables de la base de prod, domaine `vote.mobilactif.fr`             | Thibaut                | 1 h    |
| 6   | Fusion de la branche de développement dans `main` par une PR, CI verte                                                  | Claude                 | 1 jour |
| 7   | Sentry, sonde de disponibilité, variable `PRODUCTION_HEALTH_URL` (gel des déploiements automatique)                     | Claude                 | 1 jour |
| 8   | Test de charge sur la préproduction (200 votants FEDE : large marge ; 2 000 pour l'offre générale)                      | Claude                 | 1 jour |
| 9   | Procédure de restauration écrite et testée                                                                              | Claude + Thibaut       | ½ jour |

Une « vraie base de données » : c'est le projet `mobag-prod` de l'étape 1, vide, sans données de
démonstration. La démo reste sur la préproduction.

« Admin » : l'interface d'administration existe déjà (création d'organisations clientes,
invitations, préparation complète des AG). Seule la désignation d'un super-administrateur se fait
en base ; un écran dédié (liste des clients, activité, comptes) peut être ajouté au Lot 2.

## 5. Ce qui reste à faire pour la FEDE

Détail du besoin et des réponses : `docs/clients/FEDE_AG2027.md`.

| Chantier                                                                               | Charge estimée    |
| -------------------------------------------------------------------------------------- | ----------------- |
| Module élections : candidats par section, Pour / Contre / Abstention, nombre de postes | 8 à 10 jours      |
| Résultats par candidat, classement, élus, égalités ; exports PDF et Excel              | 3 à 4 jours       |
| Écran du votant limité aux scrutins auxquels il est habilité                           | 1 à 2 jours       |
| Interface votant en français et en anglais                                             | 3 à 4 jours       |
| Paramétrage FEDE : 4 scrutins, import des participants, droits par pays, procurations  | 2 jours           |
| Recette, répétition à blanc avec la FEDE                                               | 2 jours           |
| **Total**                                                                              | **19 à 24 jours** |

Le module élections et le bilingue sont **réutilisables** pour d'autres clients : ils enrichissent
le produit, et ne doivent pas être facturés en totalité à la FEDE.

## 6. Calendrier jusqu'au 14 avril 2027

| Période       | Jalon                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Octobre 2026  | Mise en production (section 4) ; réponses de la FEDE aux 20 questions    |
| Novembre 2026 | Module élections, résultats par section                                  |
| Décembre 2026 | Bilingue, filtrage des bulletins, recette interne                        |
| Janvier 2027  | Démonstration à la FEDE sur la préproduction avec leurs vrais bulletins  |
| Février 2027  | Réception et import de la liste des participants, droits et procurations |
| Mars 2027     | Répétition générale avec la FEDE ; instance de base agrandie pour avril  |
| 14 avril 2027 | AG : technicien sur place, gel des déploiements actif                    |
| Après l'AG    | Exports remis, archivage, retour d'expérience                            |

## 7. Chiffrage (préparé avec Alex, à valider par Thibaut)

Les montants de vente doivent être confrontés à la grille « Liste produit et tarif.xlsx ». MobAG
n'y figure pas encore : les montants ci-dessous sont des propositions. Si le prix est déjà fixé
au contrat, ce tableau sert à contrôler la marge.

**Coûts internes FEDE** : hébergement de production environ 250 € par mois, soit ~1 500 € sur la
période d'octobre à mars, mutualisable avec les autres clients.

**Proposition de structure (2 options)**

| Section                 | Ligne                                                                  | Essentiel   | Premium     |
| ----------------------- | ---------------------------------------------------------------------- | ----------- | ----------- |
| Plateforme de vote      | Licence MobAG pour l'AG (jusqu'à 250 votants, 4 scrutins)              | 2 500 €     | 2 500 €     |
| Plateforme de vote      | Adaptation des bulletins d'élection FEDE (sections, postes, résultats) | 2 000 €     | 2 000 €     |
| Plateforme de vote      | Interface votant bilingue français / anglais                           | 600 €       | 600 €       |
| Préparation             | Paramétrage, import des participants, droits et procurations           | 900 €       | 900 €       |
| Préparation             | Répétition à blanc à distance                                          | inclus      | inclus      |
| Jour J                  | Technicien sur place le 14 avril (1 personne, 1 jour)                  | 850 €       | 850 €       |
| Jour J                  | Second technicien, accueil et assistance aux votants                   | —           | 850 €       |
| Jour J                  | 10 tablettes de prêt pour les votants sans smartphone                  | —           | 500 €       |
| Jour J                  | Écran de projection des résultats, régie dédiée                        | —           | 400 €       |
| Suivi et accompagnement | **Gestion de projet**                                                  | 1 000 €     | 1 200 €     |
| Suivi et accompagnement | Transport et déplacement                                               | sur devis   | sur devis   |
| **Total HT**            |                                                                        | **7 850 €** | **9 800 €** |

Règles appliquées : 2 options seulement, ligne Gestion de projet présente, pas de remise (client
direct, hors appel d'offres), acompte de 40 %, solde après l'AG.
