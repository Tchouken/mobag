# Cahier des charges — MA-Vote (nom de code)
### Plateforme de gestion des votes en assemblée générale — MobilActif

> **Destinataire : Claude Code.** Ce document est la source de vérité du projet. Lis-le en entier avant d'écrire la moindre ligne. Place-le à la racine du repo sous `docs/SPEC.md` et référence-le depuis `CLAUDE.md`.

---

## 0. Instructions de travail pour Claude Code

1. **Commence en mode plan.** Propose une architecture, un schéma de base de données et un découpage en tâches avant de coder. Attends validation.
2. **Fiabilité avant fonctionnalités.** Ce produit sert à des votes juridiquement engageants. Toute logique qui touche aux voix, aux pouvoirs, aux présences et aux résultats doit vivre **dans Postgres** (contraintes, transactions, fonctions SQL) et être **couverte par des tests**. Jamais de calcul de résultat côté client.
3. **Aucune règle juridique codée en dur.** Quorums, majorités, plafonds de pouvoirs, traitement des abstentions : tout est **paramétrable** par AG et par résolution, avec des préréglages (presets). Si une règle te semble ambiguë, demande au lieu de supposer.
4. **Un commit par étape cohérente**, messages en français, migrations Supabase versionnées dans le repo.
5. **Chaque lot se termine** par : tests verts, déploiement preview Vercel, courte note de ce qui a été fait / ce qui reste.
6. Interface en **français**, code et noms de tables en **anglais**.

---

## 1. Contexte et objectif

MobilActif (expérience digitale événementielle B2B) lance un produit de **vote électronique pour assemblées générales** : sociétés (actionnaires/associés), copropriétés, associations, mutuelles, etc.

Le produit doit permettre à un organisateur de :
- préparer l'AG (participants, droits de vote, résolutions, pouvoirs reçus avant séance) ;
- piloter la séance en direct (émargement, quorum en temps réel, ouverture/clôture des votes, mouvements de pouvoirs) ;
- produire les documents de sortie (feuille de présence, résultats, trame de procès-verbal, journal d'audit).

**Exigence n°1 : robustesse.** Une AG ne se rejoue pas. Le système doit être stable, traçable et prévisible, y compris avec des centaines de votants simultanés et une connexion réseau de salle médiocre.

---

## 2. Stack technique

| Couche | Choix | Remarque |
|---|---|---|
| Front + API | **Next.js (App Router) + TypeScript**, hébergé sur **Vercel** | Cohérent avec les autres produits MobilActif (React/TS/Tailwind) |
| UI | Tailwind CSS + shadcn/ui | Mobile-first pour l'interface votant |
| Base de données | **Supabase (Postgres)** — région UE | RGPD : données hébergées dans l'UE |
| Auth | Supabase Auth (magic link e-mail, OTP SMS en option, lien/QR nominatif signé) | |
| Temps réel | Supabase Realtime (Postgres changes + Broadcast) | **Fallback polling** obligatoire si le WebSocket tombe |
| Logique critique | Fonctions Postgres (`plpgsql`, `SECURITY DEFINER`) appelées en RPC | Atomicité garantie |
| Fichiers | Supabase Storage (exports, signatures, pièces jointes) | |
| Validation | Zod (partagé front/back) | |
| Data fetching | TanStack Query | |
| Exports | `@react-pdf/renderer` (PDF), `docx` (Word), `exceljs` (XLSX), CSV natif | |
| Import | `papaparse` (CSV), `exceljs` ou SheetJS (XLSX) | |
| Tests | Vitest (unitaires), **pgTAP** (fonctions SQL), Playwright (E2E), **k6** (charge) | |
| Monitoring | Sentry + logs Vercel + tableau de santé interne | |
| CI/CD | GitHub → Vercel (preview par PR), GitHub Actions (tests + migrations) | Supabase Branching pour les previews si disponible sur le plan |

**Plan Supabase :** Pro minimum en production (sauvegardes, PITR, quotas Realtime). Vérifier les quotas de connexions Realtime simultanées par rapport à la taille cible des AG et prévoir l'add-on si nécessaire.

---

## 3. Rôles et accès

| Rôle | Description | Accès |
|---|---|---|
| **Super-admin MobilActif** | Équipe interne | Tous les clients, toutes les AG, support |
| **Organisateur** | Client (syndic, service juridique, secrétaire général…) | Ses AG uniquement : préparation, exports |
| **Bureau de séance** | Président, secrétaire, scrutateurs | Pilotage live, validation des résultats, signature |
| **Opérateur accueil** | Personnel d'émargement (MobilActif ou client) | Émargement entrée/sortie, saisie des pouvoirs en séance |
| **Votant** | Participant physique (porteur de ses voix et/ou de pouvoirs) | Son espace de vote sur smartphone/tablette |
| **Écran de projection** | Affichage public en salle | Lecture seule : question en cours, quorum, résultats publiés |

Sécurité par **Row Level Security** sur toutes les tables. Un organisateur ne doit jamais pouvoir lire les données d'une autre organisation (tests dédiés).

---

## 4. Concepts métier (glossaire)

- **Organisation** : le client de MobilActif.
- **Assemblée (AG)** : une séance avec date, lieu, type (AGO, AGE, AG mixte), mode (présentiel / distanciel / hybride).
- **Membre (titulaire de droits)** : personne physique ou morale qui détient des droits de vote (actionnaire, copropriétaire, adhérent). Une personne morale est représentée par une personne physique.
- **Personne présente** : individu physiquement (ou à distance) connecté qui vote. Elle vote pour elle-même et/ou pour les membres dont elle détient le pouvoir.
- **Droits de vote (poids)** : nombre de voix d'un membre. Peut varier selon la **clé de répartition** (copropriété : tantièmes généraux, ascenseur, bâtiment B… ; société : actions ordinaires, actions de préférence, droits de vote double).
- **Pouvoir (procuration)** : délégation des voix d'un membre (mandant) à une autre personne (mandataire). Types : nominatif, **en blanc** (attribué au président), **temporaire** (départ en cours de séance).
- **Vote par correspondance** : votes exprimés avant la séance, résolution par résolution.
- **Résolution** : question soumise au vote, avec sa règle de majorité et sa clé de répartition.
- **Scrutin** : ouverture → votes → clôture → résultat (provisoire puis validé).

---

## 5. Fonctionnalités

### 5.1 Gestion des organisations et des AG
- CRUD organisations, utilisateurs, invitations.
- Création d'AG : intitulé, date, lieu, type, mode, fuseau horaire, logo et couleurs du client (marque blanche légère).
- **Duplication d'AG** (reprendre les participants et les résolutions de l'an dernier).
- **AG de répétition** : copie « bac à sable » pour tester sans polluer les données réelles.
- Statuts : `brouillon` → `convoquée` → `en séance` → `close` → `archivée`. Certaines modifications sont verrouillées une fois en séance (cf. 5.9).

### 5.2 Import et gestion des participants
- **Import CSV / XLSX** avec assistant de mapping des colonnes (nom, prénom, raison sociale, e-mail, téléphone, n° de lot/actions, poids par clé de répartition, représentant légal).
- Prévisualisation, détection des doublons et erreurs (poids négatifs, e-mails invalides), rapport d'import.
- **Contrôle de cohérence** : total des voix importées vs total déclaré par l'organisateur (alerte si écart).
- Édition manuelle, ajout en séance (avec trace d'audit).
- Gestion des **clés de répartition** : une AG peut avoir N clés ; chaque membre a un poids par clé (0 si non concerné).
- Membres **co-indivisaires** / personnes morales : un membre = une ligne de droits, avec un représentant désigné.
- Envoi des **convocations** / identifiants de vote par e-mail (lien magique + QR code individuel), avec suivi d'envoi et relance.
- Hook prévu (non prioritaire) : import depuis MAX Master.

### 5.3 Édition des résolutions
- Éditeur de texte riche (titre court, texte intégral, pièces jointes PDF).
- Ordre du jour réordonnable (glisser-déposer), numérotation automatique, sous-résolutions possibles.
- Par résolution, paramètres :
  - **clé de répartition** utilisée ;
  - **type de vote** : Pour / Contre / Abstention (standard), choix multiple, élection de candidats (N sièges), question sans vote (information) ;
  - **règle de majorité** (preset ou personnalisée) : majorité simple des voix exprimées, majorité des voix des présents/représentés, majorité absolue de tous les membres, majorité qualifiée (2/3, 3/4…), unanimité ;
  - **traitement des abstentions et blancs** (comptés comme exprimés ou non) ;
  - **quorum requis** propre à la résolution le cas échéant ;
  - **vote secret ou nominatif** ;
  - **mode** : électronique, main levée (saisie opérateur), mixte.
- Versionnage du texte : toute modification après convocation est historisée et visible.

### 5.4 Pouvoirs (procurations)
**Avant séance :**
- Saisie manuelle ou import des pouvoirs reçus (mandant → mandataire), upload du scan du pouvoir signé.
- Pouvoirs **en blanc** → attribués automatiquement au président de séance (paramétrable).
- Option : formulaire en ligne permettant au membre de désigner son mandataire lui-même (lien sécurisé), avec confirmation par e-mail.

**Règles paramétrables par AG (avec presets) :**
- nombre maximum de pouvoirs par mandataire ;
- plafond en pourcentage des voix totales détenues par un mandataire (pouvoirs inclus) ;
- interdiction de sous-délégation (un mandataire ne peut pas redonner un pouvoir reçu) — activée par défaut ;
- catégories de personnes ne pouvant pas être mandataires (ex. le syndic et ses proches en copropriété) via un marqueur « non éligible mandataire ».
→ **Blocage à la saisie** si une règle est violée, avec message explicite. Dérogation possible uniquement par le bureau, tracée.

**En séance :**
- Transfert de pouvoir à l'arrivée (membre qui confie ses voix à un présent).
- **Départ en cours de séance** (cas critique, voir 5.6).
- Révocation d'un pouvoir si le mandant arrive en personne (il reprend ses voix).
- Vue « portefeuille » de chaque présent : ses propres voix + pouvoirs détenus, par clé de répartition.

### 5.5 Émargement (feuille de présence)
- Interface **opérateur accueil** sur tablette : recherche instantanée (nom, lot, raison sociale) ou **scan du QR code** du participant.
- À l'arrivée : identification, choix « vote pour lui-même / représente X », affectation d'un **terminal de vote** (son smartphone via QR, ou tablette prêtée), **signature manuscrite** sur écran (stockée en image + horodatage).
- Statuts de présence : `attendu` / `présent` / `représenté` / `vote par correspondance` / `parti` / `absent`.
- Horodatage de chaque arrivée et départ.
- Multi-postes d'accueil simultanés sans conflit (verrouillage optimiste, mise à jour temps réel).
- Gestion des **retardataires** : ils ne votent pas sur les résolutions déjà ouvertes ou closes, uniquement sur les suivantes.

### 5.6 Départ en cours de séance (cas critique)
Lorsqu'un présent quitte la salle :
1. L'opérateur (ou le votant depuis son terminal) déclare le départ.
2. Le système propose : **(a)** donner ses voix et ses pouvoirs à une personne présente, **(b)** sortir sans donner de pouvoir (ses voix sortent du décompte des présents/représentés), **(c)** retour temporaire prévu.
3. Les règles de plafond (5.4) s'appliquent au nouveau mandataire ; si un plafond bloque, le système l'indique et propose une autre personne.
4. **Si un scrutin est ouvert au moment du départ** : la règle par défaut est que le vote déjà exprimé reste acquis ; si le partant n'a pas encore voté, le mandataire peut voter pour lui sur ce scrutin. Comportement paramétrable.
5. Le **quorum est recalculé immédiatement** et diffusé à tous les écrans.
6. Si la personne revient, elle peut récupérer ses voix (révocation du pouvoir temporaire).
Tous ces mouvements sont journalisés avec horodatage et auteur.

### 5.7 Pilotage de séance (interface bureau / régie)
- Tableau de bord temps réel : présents, représentés, votes par correspondance, **quorum atteint / non atteint** (par clé de répartition), nombre de terminaux connectés.
- Navigation dans l'ordre du jour, projection de la résolution en cours.
- **Ouverture d'un scrutin** : figer la **base de calcul** (instantané des présents/représentés et de leurs poids au moment de l'ouverture). Les mouvements ultérieurs n'affectent pas ce scrutin sauf règle 5.6.4.
- Suivi de la participation en direct (X % des voix ont voté), sans révéler les tendances avant clôture (paramétrable).
- Relance (notification sur les terminaux n'ayant pas voté).
- **Clôture** manuelle ou par minuteur, avec compte à rebours affiché.
- Résultat **provisoire** → **validation** par le président → publication sur l'écran de projection.
- **Réouverture** d'un scrutin (erreur, incident) : possible uniquement par le bureau, avec motif obligatoire, ancien résultat conservé dans l'historique.
- **Saisie main levée** : l'opérateur saisit les « contre » et « abstentions » nominativement, le reste est compté « pour » (méthode classique), ou saisie libre.
- **Vote assisté** : un opérateur saisit le vote d'une personne sans terminal (traçé « saisi par »).

### 5.8 Interface votant (mobile-first)
- Accès par QR code / lien magique, sans création de mot de passe.
- Écran d'attente → résolution ouverte → choix → **confirmation explicite** → accusé de réception.
- Si la personne détient des pouvoirs : choix **« même vote pour toutes mes voix »** ou **« vote distinct par mandant »** (le mandataire peut devoir suivre des consignes différentes). Les votes par correspondance déjà exprimés par un mandant sont affichés et non modifiables.
- Modification du vote possible tant que le scrutin est ouvert (paramétrable).
- Affichage du récapitulatif de ses voix par clé de répartition.
- Fonctionne sur réseau dégradé : envoi avec **clé d'idempotence**, réessai automatique, indicateur clair « vote enregistré » uniquement après confirmation serveur.
- Accessibilité : contrastes, grandes cibles tactiles, compatible lecteur d'écran (public souvent âgé).

### 5.9 Verrouillages et intégrité
- Une fois l'AG **en séance** : les poids, les clés de répartition et les résolutions déjà votées ne sont plus modifiables, sauf action du bureau tracée avec motif.
- Une fois l'AG **close** : lecture seule. Toute correction passe par une procédure d'avenant tracée.
- Unicité stricte : **un seul vote par membre et par scrutin** (contrainte en base), quel que soit le nombre de terminaux ou de tentatives.

### 5.10 Exports et rendus
| Export | Format | Contenu |
|---|---|---|
| Feuille de présence | PDF + XLSX | Membres, poids par clé, statut, mandataire, heures d'arrivée/départ, signatures |
| Liste des pouvoirs | PDF + XLSX | Mandant, mandataire, type, horodatage, scans joints |
| Résultats par résolution | PDF + XLSX + CSV | Base de calcul, voix exprimées, pour/contre/abstention en voix et en %, règle appliquée, adoptée/rejetée |
| Détail nominatif des votes | XLSX | **Uniquement pour les votes non secrets** (ex. copropriété : noms des opposants et abstentionnistes requis au PV) |
| **Trame de procès-verbal** | DOCX | Pré-rempli : en-tête, quorum, résultats, mentions nominatives ; éditable ensuite dans Word |
| Journal d'audit | PDF + CSV | Tous les événements horodatés, avec empreinte d'intégrité |
| Archive complète | ZIP | Tout ce qui précède + empreinte SHA-256 de l'archive |
- Modèles d'export personnalisables (logo client, en-têtes, mentions légales).
- Génération côté serveur, asynchrone si volumineuse, stockée dans Supabase Storage avec lien de téléchargement signé.

### 5.11 Écran de projection
- URL dédiée en lecture seule, plein écran, thème du client.
- Affiche : titre de l'AG, résolution en cours, compte à rebours, taux de participation, quorum, **résultat une fois validé** (graphique barres ou camembert).

### 5.12 Mode distanciel / hybride (Lot 3)
- Votants à distance via le même lien, intégration d'un flux vidéo (lien externe Zoom/Teams/YouTube embarqué).
- Émargement distant par connexion authentifiée + OTP.

---

## 6. Modèle de données (proposition, à affiner en mode plan)

```
organizations(id, name, branding, created_at)
users(id, email, ...)                         -- Supabase Auth
org_members(org_id, user_id, role)
assemblies(id, org_id, title, type, mode, status, starts_at, settings jsonb, is_rehearsal)
weight_keys(id, assembly_id, code, label, total_declared)
members(id, assembly_id, kind[person|legal], display_name, external_ref, email, phone,
        representative_name, is_proxy_ineligible, ...)
member_weights(member_id, weight_key_id, weight numeric)        -- PK composite
attendees(id, assembly_id, person_name, member_id nullable, device_token, ...)  -- personnes physiques présentes
attendance_events(id, assembly_id, attendee_id, member_id, type[check_in|check_out|return],
                  at, by_user_id, signature_path)
proxies(id, assembly_id, grantor_member_id, holder_attendee_id, type[named|blank|temporary],
        status[active|revoked|consumed], valid_from, valid_to, document_path, created_by)
resolutions(id, assembly_id, position, title, body, attachments, weight_key_id,
            vote_type, majority_rule jsonb, abstention_policy, quorum_rule jsonb,
            is_secret, mode, version)
resolution_versions(...)                       -- historique des textes
ballots(id, resolution_id, status[draft|open|closed|validated|reopened],
        opened_at, closed_at, validated_at, validated_by, snapshot_id)
ballot_snapshots(id, ballot_id, member_id, weight, represented_by_attendee_id, presence_status)
        -- base de calcul figée à l'ouverture
votes(id, ballot_id, member_id, choice, weight, cast_by_attendee_id, cast_channel
      [device|operator|show_of_hands|correspondence], idempotency_key, cast_at)
      UNIQUE(ballot_id, member_id)
correspondence_votes(member_id, resolution_id, choice, received_at, document_path)
results(ballot_id, computed jsonb, outcome[adopted|rejected], computed_at)
audit_log(id, assembly_id, actor, action, payload jsonb, at, prev_hash, hash)   -- append-only, chaîné
exports(id, assembly_id, kind, status, path, sha256, created_at)
```

**Fonctions SQL critiques (RPC), toutes transactionnelles et testées en pgTAP :**
- `check_in(attendee, member, ...)`, `check_out(attendee, transfer_to?)`
- `grant_proxy(grantor, holder, type)` — applique toutes les règles de plafond
- `revoke_proxy(proxy_id, reason)`
- `open_ballot(resolution_id)` — crée l'instantané
- `cast_vote(ballot_id, member_ids[], choice, idempotency_key)` — vérifie que l'appelant détient bien ces voix au moment du vote
- `close_ballot(ballot_id)`, `compute_result(ballot_id)`, `validate_result(ballot_id)`, `reopen_ballot(ballot_id, reason)`
- `current_quorum(assembly_id, weight_key_id)`

**Journal d'audit** : table en ajout seul (aucun UPDATE/DELETE autorisé, y compris pour le service role via trigger), chaque ligne contient le hash de la précédente → toute altération est détectable. Une fonction `verify_audit_chain(assembly_id)` le contrôle et son résultat figure dans l'export.

---

## 7. Exigences non fonctionnelles

### 7.1 Performance et charge
- Cible de dimensionnement : **2 000 votants simultanés** sur une AG, **500 votes/seconde** en pointe à l'ouverture d'un scrutin.
- Enregistrement d'un vote : **p95 < 500 ms**, p99 < 1,5 s.
- Mise à jour du quorum et de la participation sur les écrans : < 2 s.
- Scénarios **k6** livrés dans le repo et exécutés avant chaque mise en production.

### 7.2 Disponibilité et résilience
- Aucune perte de vote : un vote n'est affiché « enregistré » qu'après commit en base.
- Idempotence de toutes les actions critiques (double-tap, réseau qui coupe, réessai).
- Temps réel en WebSocket, **bascule automatique en polling** (toutes les 3 s) si la connexion Realtime est perdue.
- **Mode dégradé** documenté : si l'électronique tombe, le bureau bascule une résolution en saisie main levée/papier depuis la régie, sans perdre ce qui a déjà été voté.
- Sauvegardes Supabase + PITR activés ; procédure de restauration testée.
- Gel des déploiements le jour d'une AG (feature flag « AG en cours » qui bloque les déploiements de production via check GitHub).

### 7.3 Sécurité
- RLS sur toutes les tables, tests d'isolation entre organisations.
- Jetons de vote individuels, signés, révocables, à durée de vie limitée à l'AG.
- Rate limiting sur les endpoints de vote et d'authentification.
- Aucune clé service role côté client. Variables d'environnement via Vercel.
- En-têtes de sécurité (CSP, HSTS), protection CSRF sur les actions sensibles.
- **Vote secret** : les résultats affichés et exportés sont agrégés ; le détail nominatif n'est accessible à aucun rôle via l'interface. Il est conservé en base uniquement pour l'intégrité et l'audit, accessible au super-admin sur procédure tracée. *(Point à valider juridiquement selon le type d'AG.)*

### 7.4 RGPD
- Hébergement UE (Vercel région UE pour les fonctions, Supabase région UE).
- Durée de conservation paramétrable par organisation, purge automatique des données personnelles après échéance (les résultats agrégés et le PV restent).
- Export des données d'un membre sur demande.
- Registre des sous-traitants à fournir (Vercel, Supabase, fournisseur e-mail/SMS).

### 7.5 Qualité
- TypeScript strict, ESLint, Prettier.
- Couverture de tests : **100 % des fonctions SQL critiques**, parcours E2E Playwright pour : import → convocation → émargement → pouvoir → départ en séance → vote → résultat → export.
- Jeux de données de démo (« copro 120 lots, 3 clés », « SAS 40 associés », « association 1 500 adhérents »).

---

## 8. Découpage en lots

### Lot 1 — Socle et vote en présentiel (MVP utilisable en vraie AG)
- Auth, organisations, rôles, RLS
- Création d'AG, clés de répartition, import participants CSV/XLSX
- Résolutions (Pour/Contre/Abstention, majorités paramétrables)
- Pouvoirs avant séance + règles de plafond
- Émargement tablette (recherche + QR + signature)
- Départ en cours de séance avec transfert de pouvoir
- Pilotage de séance, instantané, ouverture/clôture, calcul et validation des résultats
- Interface votant mobile
- Écran de projection
- Exports : feuille de présence PDF/XLSX, résultats PDF/XLSX
- Journal d'audit chaîné
- Tests pgTAP + E2E du parcours complet + test de charge k6

### Lot 2 — Production et confort
- Convocations e-mail + relances, formulaire de désignation de mandataire en ligne
- Votes par correspondance
- Trame de PV DOCX, archive ZIP scellée
- Main levée, vote assisté, réouverture de scrutin
- Élections de candidats, choix multiples
- AG de répétition, duplication d'AG
- Marque blanche (logo, couleurs) sur votant + projection + exports

### Lot 3 — Hybride et intégrations
- Mode distanciel/hybride, OTP SMS
- Intégration MAX Master (import participants)
- Statistiques multi-AG pour l'organisateur
- API publique (webhooks fin de scrutin)

---

## 9. Hypothèses et points à confirmer avant le Lot 1

1. **Types d'AG prioritaires** : sociétés, copropriétés, associations ? Les règles de majorité et de pouvoirs diffèrent fortement ; les presets seront construits en priorité pour les types retenus.
2. **Taille maximale visée** d'une AG (pour calibrer les tests de charge et le plan Supabase).
3. **Terminaux** : smartphone personnel des votants, tablettes fournies par MobilActif, ou les deux ?
4. **Valeur juridique** de la signature d'émargement sur écran : suffisante, ou faut-il une signature électronique qualifiée via un prestataire (Yousign, DocuSign) ?
5. **Vote secret** : modèle décrit en 7.3 acceptable, ou besoin d'un anonymat cryptographique plus fort ?
6. **Qui opère le jour J** : équipe MobilActif en régie, ou client autonome ? (impacte l'ergonomie de la régie et la documentation)
7. Validation des presets juridiques par un juriste avant mise en production.

---

## 10. Livrables attendus de Claude Code

- Repo GitHub structuré (`/app`, `/components`, `/lib`, `/supabase/migrations`, `/supabase/tests`, `/e2e`, `/load-tests`, `/docs`)
- `README.md` : installation locale, variables d'environnement, déploiement
- `docs/ARCHITECTURE.md` : schéma, flux temps réel, choix techniques
- `docs/RUNBOOK_JOUR_J.md` : checklist avant AG, procédure mode dégradé, contacts, que faire si…
- Données de démo et script de seed
- Rapport de test de charge
