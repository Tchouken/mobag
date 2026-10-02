# Tests de charge — Lot 1 (T17)

Mesures du 2 octobre 2026, **en local** : Supabase CLI (Docker) et le générateur k6 sur la même
machine de 4 vCPU. Ces chiffres situent les goulots d'étranglement ; ils ne remplacent pas la
mesure en préproduction sur l'offre Supabase retenue (question B6), indispensable avant la
première AG réelle.

## Scénario

`load-tests/open-ballot-burst.js` : 2 000 votants émargés, chacun avec sa propre session anonyme
(jeton émis par l'authentification Supabase) et son code de vote associé. À l'ouverture du
scrutin, chaque écran relit son état (`my_voter_context`) et vote (`cast_votes`), à un débit
montant jusqu'à `RATE` votes/s ; 10 % des envois sont rejoués avec la même clé d'idempotence.
`load-tests/verify.mjs` contrôle ensuite la base.

## Résultats

| Configuration                                 | Débit visé  | Vote p95    | Vote p99     | Erreurs  | Contrôle de la base                                             |
| --------------------------------------------- | ----------- | ----------- | ------------ | -------- | --------------------------------------------------------------- |
| Base seule (10 connexions directes, sans API) | max.        | 16 ms       | —            | 0        | **1 053 votes/s**                                               |
| API, jetons HS256                             | 250 votes/s | 432 ms      | 720 ms       | 0 %      | 2 000 votes, unicité, réessais sans effet, empreinte intègre ✅ |
| API, jetons HS256                             | 500 votes/s | 1,27 s      | 1,92 s       | 2,3 %    | saturation : ~245 votes/s soutenus ❌                           |
| API, jetons ES256 (réels)                     | 100 votes/s | 1,4 à 8,4 s | 2,7 à 11,8 s | 0 à 13 % | ❌                                                              |

Dans tous les cas, **aucun vote n'est perdu ni doublé** : ce qui est enregistré l'est une fois,
les réessais renvoient la même réponse sans rien écrire, et l'empreinte des votes inscrite à la
clôture correspond à leur historique.

## Analyse

1. **La base n'est pas le goulot.** `cast_votes` coûte ~5 ms (idempotence, contrôles, écriture,
   historique) ; 10 connexions enregistrent plus de 1 000 votes/s, p95 16 ms.
2. **Le coût dominant est la vérification des jetons par l'API (PostgREST).** Les projets Supabase
   récents signent les sessions en ES256 (clés asymétriques). Pour chaque jeton qu'il n'a pas en
   cache, PostgREST consacre ~18 ms de CPU à la vérification : avec 2 000 jetons distincts, le débit
   tombe à 150–200 requêtes/s sur 4 vCPU (contre ~640/s avec des jetons HS256, et ~880/s quand
   peu de jetons distincts circulent). Une AG est précisément le cas défavorable : 2 000 appareils,
   2 000 jetons, tous actifs à la même seconde.
3. **Limite propre à l'environnement local** : la passerelle (Kong) du CLI Supabase n'accepte que
   512 connexions simultanées ; au-delà de ~250 utilisateurs virtuels, elle répond 500 ou coupe la
   connexion. D'où `MAX_VUS = 200` par défaut en local.

## Optimisation appliquée

- L'écran du votant ne fait plus qu'**un appel** à l'ouverture d'un scrutin : `my_voter_context`
  renvoie désormais les scrutins ouverts (migration `20261002000018`), au lieu de deux lectures.
  À l'ouverture, la charge passe de 3 à 2 requêtes par votant (lecture + vote).

## À décider avant la mise en production (DECISIONS B9)

Mesurer le scénario en préproduction sur l'offre visée (`npm run load:prepare` puis
`npm run load:run` avec `MAX_VUS=1500`). Si la vérification ES256 s'y confirme comme goulot :

1. dimensionner l'instance (taille de calcul Supabase : PostgREST tourne sur la même machine) ;
2. ou signer les sessions avec la clé partagée HS256 (« legacy JWT secret », toujours proposée
   par Supabase) : ~3 fois moins de CPU par requête, au prix d'un secret symétrique ;
3. ou faire transiter les votes par une fonction serveur qui vérifie le jeton une fois (Node,
   WebCrypto) et appelle la base sous une identité de service.

Quotas temps réel : 2 000 appareils connectés au canal des votants dépassent le quota de
connexions simultanées par défaut de l'offre Pro (question Q2, à vérifier dans la console
Supabase et à relever avant l'AG). En cas de dépassement, les écrans passent en relecture
toutes les 3 s (testé en T11), ce qui ajoute de la charge sur l'API.
