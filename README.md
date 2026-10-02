# MobAG — vote en assemblée générale (MobilActif)

Plateforme de gestion des votes en AG : préparation, émargement, pouvoirs, scrutins en direct, résultats et exports.
Spécification : [`docs/SPEC.md`](docs/SPEC.md) · Plan du Lot 1 : [`docs/PLAN_LOT1.md`](docs/PLAN_LOT1.md) · Décisions : [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Stack

Next.js (App Router, TypeScript strict) sur Vercel (région UE) · Supabase (Postgres, Auth, Realtime, Storage) en région UE · Tailwind · Zod · TanStack Query · Vitest · pgTAP · Playwright · k6.

## Installation locale

Prérequis : Node 22+, Docker (pour Supabase local).

```bash
npm install
./scripts/dev-env.sh --app    # Docker, Supabase et Next.js (idempotent)
# ou, étape par étape :
npm run db:start              # démarre Postgres/Auth/Realtime en local
cp .env.example .env.local    # puis renseigner les clés affichées par `npx supabase status`
npm run dev
```

En local, les e-mails (liens de connexion) sont visibles dans Mailpit : http://127.0.0.1:54324.

## Premier super-admin

Les organisations (clients) sont créées par un super-admin MobilActif. Pour désigner le premier :

1. se connecter une fois sur `/login` avec son adresse, pour que le compte existe ;
2. exécuter en SQL (éditeur SQL Supabase, ou `psql` en local) :

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'prenom.nom@mobilactif.fr';
```

Les super-admins suivants s'ajoutent de la même façon. Il n'existe volontairement aucune RPC pour cela.

## Données de démonstration

```bash
npx supabase db reset   # base vierge
npm run db:demo         # organisation de démonstration, trois AG convoquées
```

Connexion avec `demo@mobag.local` (lien dans Mailpit). La démonstration contient :

- **Société Démo SA** : 40 actionnaires, président désigné, pouvoirs en blanc votés selon l'avis du conseil ;
- **Association Démo** : 1 500 adhérents, quorum d'un quart, 60 mandataires portant chacun 2 pouvoirs ;
- **Résidence Les Tilleuls** : copropriété de 120 lots, 3 clés (charges générales, ascenseur, bâtiment B),
  majorités des articles 24, 25 et 26, plafond de pouvoirs « 3 OU 10 % », syndic non éligible mandataire.

Le compte de démonstration est président, secrétaire et agent d'accueil des trois AG : accueil, régie et
projection sont utilisables tout de suite.

## Vérifications

```bash
npm run lint && npm run typecheck && npm test   # application
npm run db:test                                 # tests pgTAP des fonctions SQL
npm run test:integration                        # concurrence, import massif (base locale)
npm run test:e2e                                # parcours complet dans le navigateur (Playwright)
```

Le parcours de bout en bout (`e2e/assembly-journey.spec.ts`) passe uniquement par l'interface : création
de l'AG, import, résolution, pouvoir, bureau, convocation, émargements signés, appareils de vote, départ
avec transmission, régie, votes sur deux smartphones, résultat validé, projection, exports, intégrité du
journal d'audit. Il demande Supabase local démarré (avec Mailpit) et lance l'application au besoin.

## Variables d'environnement

| Variable                               | Portée             | Rôle                                                          |
| -------------------------------------- | ------------------ | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | publique           | URL du projet Supabase                                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publique           | clé publishable (soumise à la RLS)                            |
| `SUPABASE_SECRET_KEY`                  | serveur uniquement | exports et tâches d'administration ; jamais exposée au client |

En production, les variables sont gérées dans Vercel.

## Déploiement

Une preview Vercel est créée par PR. Les migrations Supabase sont versionnées dans `supabase/migrations` et appliquées par la CI.
