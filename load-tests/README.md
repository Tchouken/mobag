# Tests de charge (k6)

Scénario de référence (SPEC §7.1) : ouverture d'un scrutin devant 2 000 votants, rafale jusqu'à
500 votes/s, 10 % d'envois rejoués (même clé d'idempotence). Seuils : vote p95 < 500 ms,
p99 < 1,5 s, aucune erreur ; ensuite, un vote et un seul par votant, empreinte et journal intègres.

```bash
# 1. Préparer : AG de 2 000 votants émargés, une session anonyme réelle par appareil, scrutin ouvert
npm run load:prepare                      # ou : node load-tests/prepare.mjs --voters 2000
# 2. Lancer la charge (k6 installé : https://grafana.com/docs/k6/latest/set-up/install-k6/)
npm run load:run                          # variables : RATE (500), MAX_VUS (200), DEBUG=1
# 3. Contrôler : votes, unicité, réessais sans effet, clôture, empreinte, chaîne d'audit
npm run load:verify
```

Chaque préparation crée une nouvelle organisation et 2 000 sessions anonymes : sur une base
locale, réinitialiser de temps en temps (`npx supabase db reset`) et garder à l'esprit la limite
de création de sessions anonymes (`[auth.rate_limit] anonymous_users`).

**Préproduction** : `DATABASE_URL`, `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` désignent le
projet visé ; relever `MAX_VUS` (ex. 1500). La limite de 512 connexions de la passerelle locale ne
s'y applique pas. Ne jamais lancer contre la production.

`--legacy-jwt` (local uniquement) re-signe les jetons en HS256 pour mesurer le coût de la
vérification des signatures ES256 (voir `docs/lots/CHARGE_LOT1.md`).
