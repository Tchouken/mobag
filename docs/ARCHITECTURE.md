# Architecture — MobAG (MA-Vote)

Document de référence technique à la fin du Lot 1. Le cahier des charges est `docs/SPEC.md` ;
les arbitrages et questions ouvertes sont dans `docs/DECISIONS.md`.

## Principe directeur

**La base de données est l'unique source de vérité.** Toute règle qui touche aux voix, aux
pouvoirs, à la présence et aux résultats vit dans Postgres : contraintes, déclencheurs et
fonctions `plpgsql` `SECURITY DEFINER` (`set search_path = ''`), appelées en RPC. Les écrans
n'écrivent jamais dans une table et ne calculent aucun résultat : ils appellent une fonction qui
vérifie les droits, applique les règles, écrit le journal d'audit et diffuse un signal temps réel,
dans la même transaction.

```
Navigateur (accueil, régie, votant, projection)
   │  lectures : tables (RLS) ou RPC de lecture      écritures : RPC uniquement
   ▼
Next.js 16 (App Router, Vercel cdg1) ── pages serveur, actions serveur, routes d'export
   │
   ▼
Supabase (UE) : PostgREST · Auth (liens magiques, sessions anonymes) · Realtime (Broadcast) · Storage
   │
   ▼
Postgres : tables en lecture seule pour les clients · RPC · déclencheurs · journal chaîné · pg_cron
```

## Pile technique

| Couche      | Choix                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Application | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript strict, Tailwind 4                                                   |
| Données     | Supabase : Postgres 17, PostgREST, Auth, Realtime, Storage ; extensions pgcrypto, citext, pg_cron                              |
| Validation  | Zod (client et actions serveur) en miroir des validateurs SQL (test de parité)                                                 |
| Documents   | pdf-lib (PDF), ExcelJS (tableur), Tiptap (texte des résolutions)                                                               |
| Tests       | pgTAP (fonctions SQL), Vitest (unitaires, intégration et concurrence sur Postgres), Playwright (parcours complet), k6 (charge) |

## Modèle de données (par migration)

| Migration | Contenu                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0001–0004 | schéma `private`, privilèges par défaut retirés, organisations, membres d'organisation, invitations, super-admins, journal d'audit chaîné                                |
| 0005–0006 | assemblées, règles (quorum, majorité, pouvoirs, réglages) validées en SQL, modèles de règles (`rule_presets`), clés de répartition, bureau et accueil (`assembly_staff`) |
| 0007      | membres et poids par clé ; import en masse ensembliste (20 000 lignes)                                                                                                   |
| 0008      | résolutions (texte Tiptap), versions en ajout seul, pièces jointes                                                                                                       |
| 0009–0010 | personnes (`attendees`), membres portés en propre, pouvoirs, présence **calculée** (`member_presence`), émargement, départs, retours, quorum, import de pouvoirs         |
| 0011      | identité des votants : codes de vote (empreinte seule), appareils associés par session anonyme                                                                           |
| 0012      | signatures d'émargement (Storage), instantané de l'accueil                                                                                                               |
| 0013      | scrutins, base figée (`ballot_eligibility`), votes, historique des votes, idempotence, résultats, minuteur (pg_cron)                                                     |
| 0014      | temps réel : signaux Broadcast sur canaux privés                                                                                                                         |
| 0015      | verrous de séance, corrections du bureau, minuteur et relance, instantané de la régie, présence des terminaux                                                            |
| 0016      | lien de l'écran de projection et état public                                                                                                                             |
| 0017      | exports (bucket privé, journal des documents avec SHA-256)                                                                                                               |
| 0018      | lecture unique de l'écran du votant (charge)                                                                                                                             |
| 0019      | état de la plateforme (gel des déploiements)                                                                                                                             |

Les migrations ne sont jamais modifiées une fois fusionnées.

## Sécurité

- **RLS partout, lecture seule.** Chaque table a la RLS activée et forcée, avec uniquement des
  politiques `SELECT`. Aucun rôle applicatif n'a de droit d'écriture ; `service_role` non plus.
- **Rôles.** Super-admin MobilActif, administrateur et organisateur d'organisation (préparation),
  bureau de séance (président, secrétaire, scrutateur : pilotage, dérogations, corrections),
  accueil (émargement), votant (appareil associé), écran de projection (jeton). Les fonctions
  `private.*` de droits sont la seule référence ; l'interface ne fait que les refléter.
- **Votants sans compte.** Code de 16 caractères (80 bits), seule l'empreinte SHA-256 est stockée ;
  il voyage dans le fragment de l'URL (`/v#CODE`). L'appareil ouvre une session anonyme Supabase et
  réclame le code : un code par personne, un appareil par personne et par AG. Les votants n'ont
  accès à aucune table : ils lisent par RPC (`my_voter_context`, scrutins compris).
- **Votes secrets** (modèle §7.3) : le vote est rattaché au membre (unicité, modification,
  contrôle) mais aucune politique ne permet de le lire ; seuls des agrégats sortent.
- **Journal d'audit chaîné** par assemblée (empreinte de chaque ligne liée à la précédente), en
  ajout seul (déclencheurs anti UPDATE/DELETE/TRUNCATE). Les votes n'y passent pas un par un : à
  la clôture, l'empreinte de leur historique y est inscrite ; `verify_audit_chain` recalcule tout.
- **Navigateur.** CSP à nonce par requête (`proxy.ts`, `lib/security/csp.ts`), HSTS, pas
  d'intégration en cadre, `nosniff`. Routes qui écrivent : POST et contrôle d'origine.

## Cycle d'une AG

1. **Préparation** (organisateur) : AG, règles, clés, import des membres, résolutions, pouvoirs,
   bureau et accueil, convocation. Tout est modifiable jusqu'à l'ouverture de la séance.
2. **Accueil** (`/accueil/[id]`) : recherche, émargement signé, appareil de vote (QR du
   smartphone ou tablette prêtée), pouvoir reçu, départ (transmission, absence temporaire, sortie),
   retour. Les plafonds de pouvoirs sont vérifiés en base, sous verrou de l'AG (deux postes ne
   peuvent pas les dépasser ensemble).
3. **Séance** (`/regie/[id]`) : ouverture ; un vote à la fois. L'ouverture **fige la base** (qui
   porte quelles voix, avec quel poids, quorum évalué). Les retardataires n'entrent pas dans un vote
   ouvert ; un départ transmet les voix non encore exprimées. Clôture manuelle ou au minuteur,
   résultat provisoire calculé en nombres exacts (produit en croix), validation par la présidence.
   Pendant la séance, la préparation est verrouillée (seconde barrière par déclencheurs) ; seules
   des corrections du bureau, motivées et tracées, restent possibles.
4. **Vote** (`/vote`) : choix, confirmation, envoi idempotent avec réessais ; « enregistré » n'est
   affiché qu'après la réponse du serveur.
5. **Projection** (`/projection#JETON`) : quorum, vote en cours (participation sans tendance),
   dernier résultat validé.
6. **Clôture et exports** : feuille de présence (signatures) et résultats, en PDF, tableur et CSV,
   avec leur empreinte SHA-256.

## Temps réel

Broadcast sur deux canaux privés par AG (`assembly:{id}:staff`, `assembly:{id}:voters`),
autorisés par RLS sur `realtime.messages`. Les messages ne portent qu'un signal ; l'écran relit
son état par RPC. Les votes ne sont pas diffusés (participation relue par la régie toutes les 2 s).
Si le canal n'est pas abonné, les écrans relisent toutes les 3 s. La présence Realtime des
appareils votants donne le nombre de terminaux connectés.

## Concurrence et intégrité

- Mouvements de présence d'une AG sérialisés par verrou consultatif transactionnel.
- Vote : verrou consultatif **partagé** par scrutin ; la clôture le prend en **exclusif** (aucun
  vote accepté après). Unicité `(scrutin, membre)` en base ; garde dans l'`ON CONFLICT` contre
  deux envois simultanés quand la modification est interdite.
- Idempotence : la clé d'envoi est réservée dans la transaction du vote ; un réessai rejoue la
  réponse enregistrée.
- Ces propriétés sont testées en parallèle réel (`tests/integration`) et par mutation (retirer le
  verrou fait échouer les tests).

## Arborescence

```
app/            pages : (admin) préparation, (live) accueil et régie, v et vote (votant),
                projection, api (exports, santé)
components/     interface par domaine (assembly, members, resolutions, proxies, reception,
                regie, voter, projection, exports, ui)
lib/            domaine (règles, modèles d'écran), supabase, temps réel, exports, sécurité, rpc
supabase/       migrations, tests pgTAP, données de démonstration (seed/demo.sql)
tests/          unitaires, intégration (Postgres local)
e2e/            parcours complet Playwright
load-tests/     k6 : préparation, scénario, contrôle
scripts/        environnement local, garde de déploiement
docs/           SPEC, plan, décisions, architecture, runbook, notes de lot
```
