# MobAG (MA-Vote) — consignes pour Claude Code

**Source de vérité : [`docs/SPEC.md`](docs/SPEC.md).** Lis-la en entier avant toute modification.
Plan validé du Lot 1 : [`docs/PLAN_LOT1.md`](docs/PLAN_LOT1.md). Arbitrages et questions ouvertes : [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Règles non négociables

1. **Toute logique qui touche aux voix, pouvoirs, présences et résultats vit dans Postgres** (contraintes, transactions, fonctions `plpgsql SECURITY DEFINER` avec `set search_path = ''`), appelée en RPC. Jamais de calcul de résultat côté client.
2. **Tables en lecture seule pour les clients** : RLS activée partout, uniquement des politiques `SELECT`. Les écritures passent exclusivement par des RPC qui vérifient les droits, écrivent l'audit et diffusent l'événement temps réel.
3. **Aucune règle juridique codée en dur** : quorums, majorités, plafonds de pouvoirs et abstentions sont paramétrables (JSON validé en SQL et en Zod), avec des presets en base. Si une règle est ambiguë, **demander** et consigner la réponse dans `docs/DECISIONS.md`.
4. **Tests** : 100 % des fonctions SQL critiques couvertes en pgTAP (`supabase/tests/database`). La concurrence est testée en Vitest (`tests/integration`).
5. **Calculs en `numeric` exact**, seuils `{num, den}` comparés par produit croisé, jamais de flottant.
6. Le journal d'audit et les tables d'historique sont **en ajout seul** (triggers anti UPDATE/DELETE/TRUNCATE).

## Conventions

- Interface en **français**, code, tables et colonnes en **anglais**.
- Erreurs métier SQL : `raise exception using errcode = 'P0001', message = '<code_stable>'`. Traduction FR dans `lib/rpc`.
- Migrations versionnées dans `supabase/migrations`, jamais modifiées une fois mergées.
- **Un commit par étape cohérente, message en français.**
- Chaque lot se termine par : tests verts, preview Vercel, note `docs/lots/LOTn_NOTE.md`.

## Commandes

```bash
npm run dev          # Next.js en local
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run format       # Prettier
npm test             # Vitest
npx supabase start   # Postgres local (Docker requis)
npx supabase test db # pgTAP
```
