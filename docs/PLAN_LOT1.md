# MobAG (MA-Vote) — Plan d'architecture et Lot 1

## Contexte

Le repo `tchouken/mobag` est vide (branche `claude/brave-galileo-naqqpf`, aucun commit). La source de vérité est le cahier des charges fourni (à copier tel quel en `docs/SPEC.md`, référencé depuis `CLAUDE.md`). Le produit sert à des votes juridiquement engageants : **toute logique de voix, de pouvoirs, de présence et de résultat vit dans Postgres** (contraintes, fonctions `SECURITY DEFINER` transactionnelles, tests pgTAP). Le client ne calcule jamais rien qui engage. Ce plan propose l'arborescence, le schéma SQL, les RPC critiques et le découpage du Lot 1. **Plan validé le 2026-10-01.** Les questions ouvertes sont suivies dans `docs/DECISIONS.md`.

### Principes structurants (décisions proposées)

1. **Les tables sont en lecture seule pour les clients.** RLS activée (et forcée) partout, uniquement des politiques `SELECT`. Toute écriture passe par une RPC `SECURITY DEFINER` (`set search_path = ''`) qui vérifie les droits, applique les règles, écrit l'audit et diffuse l'événement temps réel. Les triggers de verrouillage (5.9) servent de seconde barrière.
2. **État courant matérialisé + historique.** `member_presence` contient l'état courant de chaque membre (statut, détenteur actuel des voix). Il n'est modifié que par les RPC et se lit en O(1) pour le quorum. `attendance_events`, `proxies` et `audit_log` portent l'historique.
3. **Instantané au scrutin.** `open_ballot` copie dans `ballot_eligibility` qui détient quelles voix, avec quel poids. `cast_votes` ne vérifie que cet instantané (règle 5.6.4 mise à part).
4. **Une chaîne d'audit hors du chemin chaud.** `audit_log` est chaîné par assemblée (verrou sur `audit_heads`) pour les événements d'administration et de séance. Chaîner chaque vote sérialiserait 500 votes/s sur une seule ligne. Les votes vont donc dans `vote_events` (en ajout seul), **scellés à la clôture** : l'empreinte SHA-256 des votes ordonnés est inscrite dans la chaîne (`ballot.closed`). `verify_audit_chain` recalcule les deux.
5. **Identité du votant sans mot de passe.** À l'émargement, la tablette affiche un QR qui contient un jeton aléatoire (seul son hash est stocké en base, avec expiration à la fin de l'AG et révocation possible). Le téléphone ouvre une **session Supabase anonyme**, puis appelle `claim_voter_token`, qui lie `auth.uid()` à l'attendee. Cela réutilise RLS et Realtime sans mint de JWT maison. Le jeton est révocable et réémissible (tablette prêtée, changement de téléphone).
6. **Temps réel par Broadcast, pas par Postgres Changes** (Postgres Changes passe mal à 2 000 abonnés avec RLS). Des triggers appellent `realtime.send()` avec de simples signaux d'invalidation (`quorum`, `ballot`, `result`). Les clients refetchent via RPC. Si le canal n'est pas `SUBSCRIBED`, le hook bascule sur un polling à 3 s. La participation en direct est lue par polling à 2 s côté régie et projection : on ne diffuse pas un message par vote.
7. **Calculs en `numeric` exact, sans flottant.** Un seuil s'exprime en `{num, den}` et se compare par produit croisé (`pour × den > num × base`).
8. **Règles paramétrables sous forme de « conditions » combinées en ET.** Elles couvrent la majorité simple, l'absolue, la qualifiée, l'unanimité et la double majorité (art. 26 copro : têtes + voix). Elles sont validées par la même structure en Zod (front) et en SQL (`CHECK` via une fonction de validation). Des presets sont seedés dans `rule_presets`, marqués « à valider juriste ».

---

## 1. Arborescence du repo

Application Next.js unique (pas de monorepo nécessaire).

```
mobag/
├── CLAUDE.md                     # règles de travail + renvoi vers docs/SPEC.md
├── README.md                     # install locale, env, déploiement
├── docs/
│   ├── SPEC.md                   # cahier des charges (source de vérité)
│   ├── ARCHITECTURE.md           # schéma, flux temps réel, choix techniques
│   ├── RUNBOOK_JOUR_J.md
│   ├── DECISIONS.md              # réponses aux questions §9 + arbitrages
│   └── lots/LOT1_NOTE.md         # fait / reste
├── app/
│   ├── (auth)/login/             # magic link staff
│   ├── (auth)/auth/callback/
│   ├── (admin)/orgs/[orgId]/
│   │   ├── page.tsx              # liste des AG
│   │   ├── members/              # utilisateurs de l'org, invitations
│   │   └── assemblies/[assemblyId]/
│   │       ├── page.tsx          # synthèse + statut
│   │       ├── settings/         # quorum, règles de pouvoirs, presets
│   │       ├── weight-keys/
│   │       ├── participants/     # liste + import/ (assistant de mapping)
│   │       ├── resolutions/      # ordre du jour, éditeur, versions
│   │       ├── proxies/          # pouvoirs avant séance
│   │       └── exports/
│   ├── (live)/
│   │   ├── regie/[assemblyId]/   # bureau : dashboard, scrutins, validation
│   │   └── accueil/[assemblyId]/ # opérateur : recherche, QR, signature, départs
│   ├── v/[token]/page.tsx        # point d'entrée QR → claim → redirection
│   ├── vote/[assemblyId]/        # interface votant mobile
│   ├── projection/[token]/       # écran public lecture seule
│   └── api/
│       ├── exports/[kind]/route.ts   # génération PDF/XLSX (runtime Node)
│       └── health/route.ts
├── components/
│   ├── ui/                       # shadcn
│   ├── assembly/ resolution/ proxy/ checkin/ regie/ voter/ projection/
│   └── shared/ (SignaturePad, QrScanner, QrCode, Countdown, QuorumGauge…)
├── lib/
│   ├── supabase/ (browser.ts, server.ts, admin.ts [server-only], middleware.ts)
│   ├── database.types.ts         # généré (supabase gen types)
│   ├── rpc/                      # wrappers typés des RPC + mapping d'erreurs FR
│   ├── domain/                   # schémas Zod partagés (rules, import, proxy…)
│   ├── presets/                  # libellés FR des presets (valeurs en base)
│   ├── realtime/useAssemblyChannel.ts  # broadcast + fallback polling 3 s
│   ├── voting/                   # file d'envoi idempotente + réessai
│   ├── import/                   # parse CSV/XLSX, mapping, détection
│   └── exports/ (pdf/, xlsx/, csv.ts)
├── supabase/
│   ├── config.toml
│   ├── migrations/               # versionnées, voir §2
│   ├── tests/database/*.test.sql # pgTAP
│   └── seed/ (seed.sql, demo_copro_120.sql, demo_sas_40.sql, demo_asso_1500.sql)
├── tests/
│   ├── unit/                     # Vitest (zod, import, utils)
│   └── integration/              # Vitest + pg : concurrence (double-tap, close vs vote, multi-accueil)
├── e2e/                          # Playwright (parcours complet)
├── load-tests/                   # k6 (open-ballot burst, 2 000 votants) + rapports
├── .github/workflows/ (ci.yml, db-tests.yml, deploy-freeze.yml)
└── middleware.ts, next.config.ts (headers CSP/HSTS), vercel.json (région cdg1/fra1)
```

---

## 2. Schéma SQL (migrations Supabase)

### 2.1 Découpage des migrations

| # | Fichier | Contenu |
|---|---|---|
| 0001 | `extensions_enums` | `pgcrypto`, `citext`, `pg_cron`, schéma `private` (non exposé), enums |
| 0002 | `tenancy` | `organizations`, `platform_admins`, `org_members`, `org_invitations`, helpers de droits |
| 0003 | `audit` | `audit_heads`, `audit_log`, `private.audit()`, triggers append-only, `verify_audit_chain` |
| 0004 | `assemblies` | `assemblies`, `assembly_staff`, `rule_presets`, `weight_keys`, validation des règles |
| 0005 | `members` | `members`, `member_weights`, `import_members` |
| 0006 | `presence_proxies` | `attendees`, `voter_tokens`, `member_presence`, `attendance_events`, `proxies` |
| 0007 | `resolutions` | `resolutions`, `resolution_versions`, `resolution_attachments` |
| 0008 | `ballots_votes` | `ballots`, `ballot_eligibility`, `votes`, `vote_events`, `vote_requests`, `results` |
| 0009 | `rls` | enable/force RLS, politiques SELECT, révocations/grants |
| 0010 | `rpc_setup` | création d'AG, clés, membres, résolutions, statut, presets |
| 0011 | `rpc_presence` | `grant_proxy`, `revoke_proxy`, `check_in`, `check_out`, `return_attendee`, `current_quorum` |
| 0012 | `rpc_ballots` | `open_ballot`, `cast_votes`, `close_ballot`, `compute_result`, `validate_result`, `close_expired_ballots` (pg_cron) |
| 0013 | `locks` | triggers de verrouillage 5.9, `bureau_override` |
| 0014 | `realtime` | triggers broadcast, politiques `realtime.messages` |
| 0015 | `storage` | buckets `signatures`, `proxy-documents`, `attachments`, `exports` + politiques |
| 0016 | `exports_views` | `exports`, vues `v_attendance_sheet`, `v_ballot_results` |

### 2.2 Enums

```sql
create type assembly_type    as enum ('ago','age','mixed','other');
create type assembly_mode    as enum ('in_person','remote','hybrid');
create type assembly_status  as enum ('draft','convened','in_session','closed','archived');
create type org_role         as enum ('org_admin','organizer');
create type staff_role       as enum ('president','secretary','scrutineer','reception');
create type member_kind      as enum ('person','legal_entity');
create type attendee_status  as enum ('expected','present','left');
create type presence_status  as enum ('expected','present','represented','correspondence','left','absent');
create type proxy_type       as enum ('named','blank','temporary');
create type proxy_status     as enum ('pending','active','revoked');   -- pending = en blanc non attribué
create type vote_type        as enum ('yes_no_abstain','multiple_choice','election','information');
create type resolution_mode  as enum ('electronic','show_of_hands','mixed');
create type ballot_status    as enum ('open','closed','validated','cancelled');
create type cast_channel     as enum ('device','operator','show_of_hands','correspondence');
create type ballot_outcome   as enum ('adopted','rejected','no_quorum','information');
```
(`multiple_choice`, `election`, `show_of_hands` et `correspondence` existent dès le départ pour éviter des migrations d'enum, mais les RPC du Lot 1 les refusent.)

### 2.3 Tables

```sql
-- ===== Tenancy =====
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  branding jsonb not null default '{}',
  retention_days int,                         -- RGPD (purge : lot ultérieur)
  created_at timestamptz not null default now()
);
create table platform_admins (user_id uuid primary key references auth.users on delete cascade);
create table org_members (
  org_id uuid references organizations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role org_role not null,
  primary key (org_id, user_id)
);
create table org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  email citext not null, role org_role not null,
  token_hash bytea not null unique, expires_at timestamptz not null,
  accepted_at timestamptz, created_by uuid not null
);

-- ===== Assemblées =====
create table assemblies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  title text not null,
  type assembly_type not null, mode assembly_mode not null default 'in_person',
  status assembly_status not null default 'draft',
  starts_at timestamptz not null, timezone text not null default 'Europe/Paris',
  location text,
  quorum_rule jsonb,                          -- règle par défaut (cf. 2.4), null = pas de quorum
  proxy_rules jsonb not null,                 -- cf. 2.4
  settings jsonb not null default '{}',       -- allow_vote_change, departure_during_ballot, hide_live_trend, blank_proxy_to…
  is_rehearsal boolean not null default false,
  president_attendee_id uuid,                 -- FK ajoutée après attendees
  projection_token_hash bytea unique,
  version int not null default 1,
  created_by uuid not null, created_at timestamptz not null default now(),
  check (private.validate_rule(quorum_rule, 'quorum')),
  check (private.validate_proxy_rules(proxy_rules))
);
create table assembly_staff (
  assembly_id uuid references assemblies on delete cascade,
  user_id uuid references auth.users,
  role staff_role not null,
  primary key (assembly_id, user_id, role)
);
create table rule_presets (
  code text primary key,                      -- 'copro_art24', 'sa_ago_1st', …
  kind text not null check (kind in ('majority','quorum','proxy')),
  assembly_family text not null,              -- 'copro' | 'company' | 'association' | 'generic'
  label_fr text not null, params jsonb not null,
  legal_reference text, validated_by_lawyer boolean not null default false
);
create table weight_keys (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies on delete cascade,
  code text not null, label text not null,
  total_declared numeric(24,6),               -- contrôle de cohérence à l'import
  is_primary boolean not null default false,
  unique (assembly_id, code)
);
create unique index on weight_keys (assembly_id) where is_primary;

-- ===== Membres / droits =====
create table members (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies on delete cascade,
  kind member_kind not null,
  display_name text not null,
  last_name text, first_name text, company_name text,
  external_ref text,                          -- n° de lot / n° d'associé
  email citext, phone text,
  representative_name text,                   -- personne morale / indivision
  is_proxy_ineligible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (assembly_id, external_ref)
);
create index on members using gin (to_tsvector('simple', display_name || ' ' || coalesce(external_ref,'')));
create table member_weights (
  member_id uuid references members on delete cascade,
  weight_key_id uuid references weight_keys on delete cascade,
  assembly_id uuid not null,                  -- dénormalisé (RLS, agrégats)
  weight numeric(24,6) not null check (weight >= 0),
  primary key (member_id, weight_key_id)
);
create index on member_weights (weight_key_id) include (weight);

-- ===== Présence / pouvoirs =====
create table attendees (                      -- personnes physiques (attendues ou présentes)
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies on delete cascade,
  full_name text not null, email citext, phone text,
  member_id uuid references members,          -- membre qu'elle est / représente légalement
  is_proxy_ineligible boolean not null default false,  -- ex. syndic non membre
  status attendee_status not null default 'expected',
  checked_in_at timestamptz, checked_out_at timestamptz,
  signature_path text,
  version int not null default 1
);
create unique index on attendees (member_id) where member_id is not null;
alter table assemblies add foreign key (president_attendee_id) references attendees;

create table voter_tokens (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies on delete cascade,
  attendee_id uuid not null references attendees on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users, claimed_at timestamptz,
  revoked_at timestamptz, issued_by uuid not null
);
create unique index on voter_tokens (attendee_id) where revoked_at is null;   -- 1 terminal actif
create index on voter_tokens (claimed_by) where revoked_at is null;

create table proxies (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies on delete cascade,
  grantor_member_id uuid not null references members,
  holder_attendee_id uuid references attendees,          -- null tant qu'un blanc n'est pas attribué
  type proxy_type not null,
  status proxy_status not null,
  parent_proxy_id uuid references proxies,               -- transfert au départ (5.6)
  return_expected boolean not null default false,        -- départ temporaire (5.6 c)
  document_path text,
  derogation_reason text, derogation_by uuid,            -- dérogation bureau (5.4)
  valid_from timestamptz not null default now(), valid_to timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid, revoked_reason text,
  check (status <> 'active' or holder_attendee_id is not null)
);
create unique index one_live_proxy_per_grantor on proxies (grantor_member_id) where status in ('pending','active');
create index on proxies (holder_attendee_id) where status = 'active';

create table member_presence (                -- ÉTAT COURANT, écrit uniquement par les RPC
  member_id uuid primary key references members on delete cascade,
  assembly_id uuid not null,
  status presence_status not null default 'expected',
  holder_attendee_id uuid references attendees,          -- qui porte les voix maintenant
  via_proxy_id uuid references proxies,
  since timestamptz not null default now(),
  version int not null default 1,
  check ((status in ('present','represented')) = (holder_attendee_id is not null))
);
create index on member_presence (assembly_id, status);
create index on member_presence (holder_attendee_id);

create table attendance_events (
  id bigint generated always as identity primary key,
  assembly_id uuid not null, attendee_id uuid not null, member_id uuid,
  type text not null check (type in ('check_in','check_out','return','token_issued','token_revoked')),
  mode text,                                  -- transfer | leave | temporary
  at timestamptz not null default clock_timestamp(),
  by_user_id uuid, payload jsonb not null default '{}'
);

-- ===== Résolutions =====
create table resolutions (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies on delete cascade,
  parent_id uuid references resolutions,
  position int not null, number text,                     -- numérotation calculée
  title text not null, body jsonb not null default '{}',  -- doc Tiptap (rendu HTML assaini à l'export)
  weight_key_id uuid not null references weight_keys,
  vote_type vote_type not null default 'yes_no_abstain',
  majority_rule jsonb,                                    -- null si information
  abstention_policy text not null default 'excluded' check (abstention_policy in ('excluded','included')),
  quorum_rule jsonb,                                      -- surcharge de assemblies.quorum_rule
  is_secret boolean not null default false,
  mode resolution_mode not null default 'electronic',
  allow_vote_change boolean,                              -- null = réglage de l'AG
  version int not null default 1,
  unique (assembly_id, position) deferrable initially deferred,
  check (private.validate_rule(majority_rule, 'majority')),
  check (private.validate_rule(quorum_rule, 'quorum')),
  check ((vote_type = 'information') = (majority_rule is null))
);
create table resolution_versions (
  id bigint generated always as identity primary key,
  resolution_id uuid not null references resolutions on delete cascade,
  version int not null, snapshot jsonb not null,          -- titre, texte, règles
  changed_by uuid not null, changed_at timestamptz not null default now(), reason text,
  unique (resolution_id, version)
);
create table resolution_attachments (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references resolutions on delete cascade,
  path text not null, filename text not null, uploaded_by uuid not null
);

-- ===== Scrutins / votes =====
create table ballots (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references resolutions,
  assembly_id uuid not null,
  round int not null default 1,                           -- réouverture (lot 2) = nouveau round
  status ballot_status not null default 'open',
  rules_snapshot jsonb not null,                          -- majorité, abstention, quorum, clé figés
  totals jsonb not null default '{}',                     -- bases figées (cf. open_ballot)
  opened_at timestamptz not null default clock_timestamp(), opened_by uuid not null,
  closes_at timestamptz,                                  -- minuteur
  closed_at timestamptz, closed_by uuid, votes_digest bytea,
  validated_at timestamptz, validated_by uuid,
  cancelled_reason text
);
create unique index one_live_ballot_per_resolution on ballots (resolution_id) where status <> 'cancelled';
create index on ballots (assembly_id, status);

create table ballot_eligibility (              -- INSTANTANÉ (base de calcul)
  ballot_id uuid references ballots on delete cascade,
  member_id uuid references members,
  weight numeric(24,6) not null,
  presence_status presence_status not null,
  holder_attendee_id uuid,
  holder_changed_at timestamptz,               -- 5.6.4
  primary key (ballot_id, member_id)
);
create index on ballot_eligibility (ballot_id, holder_attendee_id);

create table votes (
  id bigint generated always as identity primary key,
  ballot_id uuid not null references ballots,
  member_id uuid not null references members,
  assembly_id uuid not null,
  choice text not null,
  weight numeric(24,6) not null,               -- copié de l'instantané
  cast_by_attendee_id uuid, cast_by_user_id uuid,
  channel cast_channel not null,
  idempotency_key uuid not null,
  revision int not null default 1,
  cast_at timestamptz not null default clock_timestamp(),
  unique (ballot_id, member_id)                -- 5.9 : un seul vote par membre et par scrutin
);
create table vote_events (                     -- historique en ajout seul, scellé à la clôture
  id bigint generated always as identity primary key,
  ballot_id uuid not null, member_id uuid not null, choice text not null,
  weight numeric(24,6) not null, revision int not null,
  cast_by_attendee_id uuid, cast_by_user_id uuid, channel cast_channel not null,
  idempotency_key uuid not null, at timestamptz not null
);
create index on vote_events (ballot_id, id);
create table vote_requests (                   -- idempotence
  idempotency_key uuid primary key,
  attendee_id uuid not null, ballot_id uuid not null,
  response jsonb, created_at timestamptz not null default now()
);
create index on vote_requests (attendee_id, created_at);  -- rate limit
create table results (
  ballot_id uuid primary key references ballots,
  tallies jsonb not null,                      -- {for:{weight,heads}, against:…, abstain:…, not_voted:…}
  evaluation jsonb not null,                   -- détail de chaque condition (base, seuil, valeur)
  outcome ballot_outcome not null,
  computed_at timestamptz not null default clock_timestamp()
);

-- ===== Audit =====
create table audit_heads (assembly_id uuid primary key, seq bigint not null, hash bytea not null);
create table audit_log (
  id bigint generated always as identity primary key,
  assembly_id uuid not null, seq bigint not null,
  at timestamptz not null,
  actor_user_id uuid, actor_attendee_id uuid,
  action text not null,                        -- 'proxy.granted', 'ballot.closed', …
  payload jsonb not null,
  prev_hash bytea not null, hash bytea not null,
  unique (assembly_id, seq)
);
-- trigger BEFORE UPDATE OR DELETE + BEFORE TRUNCATE → raise exception (même service_role)
-- même protection sur vote_events, attendance_events, resolution_versions

-- ===== Exports =====
create table exports (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references assemblies,
  kind text not null, format text not null,
  status text not null default 'pending', path text, sha256 text,
  created_by uuid not null, created_at timestamptz not null default now()
);
```

### 2.4 Formats de règles (JSON validé en SQL et en Zod)

```jsonc
// majority_rule / quorum_rule : toutes les conditions doivent être vraies (ET)
{ "conditions": [
    { "measure": "weight" | "heads",
      "numerator": "for" | "present_represented",           // "for" pour la majorité, présents/représentés pour le quorum
      "base": "expressed" | "present_represented" | "all_members",
      "num": 1, "den": 2, "comparison": "gt" | "gte" } ],
  "preset": "copro_art26" }                                   // traçabilité
// ex. art. 26 : [{heads, for, all_members, 1/2, gt}, {weight, for, all_members, 2/3, gte}]
// unanimité : [{weight, for, expressed, 1/1, gte}]

// proxy_rules
{ "max_count": 3, "max_share": {"num":10,"den":100}, "share_key": "primary",
  "combine": "or",          // copro : autorisé si ≤ 3 pouvoirs OU total ≤ 10 %
  "forbid_subdelegation": true, "blank_to": "president",
  "allow_transfer_on_departure": true }   // cf. question bloquante B1
```

### 2.5 RLS et droits (résumé)

- Helpers `private.is_platform_admin()`, `private.has_org_role(org, roles[])`, `private.has_assembly_role(assembly, roles[])`, `private.can_manage_assembly(assembly)`, `private.current_attendee_id(assembly)` (via `voter_tokens.claimed_by = auth.uid()` non révoqué et non expiré). Toutes `stable security definer set search_path=''`.
- `anon` : aucun accès aux tables. Il n'a que `claim_voter_token` (après une connexion anonyme, rôle `authenticated` avec `is_anonymous`) et `projection_state(token)`.
- Staff : `SELECT` sur les données des AG de leur organisation, ou des AG où ils sont staff.
- Votant : `SELECT` sur son attendee, les membres qu'il porte, les résolutions et les scrutins de son AG. Il lit son propre état de vote via la RPC `my_voting_state(assembly)`.
- `votes` et `vote_events` n'ont **aucune** politique `SELECT` : ils ne sont lisibles par aucun rôle applicatif. Les résultats agrégés passent par `results`. Le détail nominatif (non secret) passe par une RPC staff qui refuse si `is_secret` (export nominatif : Lot 2).
- Aucune politique `INSERT/UPDATE/DELETE` : les écritures passent exclusivement par les RPC.
- pgTAP dédié à l'isolation : deux organisations, chaque rôle, chaque table.

### 2.6 RPC critiques

Conventions communes à toutes les RPC :
- erreurs métier `raise exception using errcode='P0001', message='<code_stable>', detail=<jsonb>` ; `lib/rpc` les traduit en français ;
- verrou d'assemblée `private.lock_presence(assembly)` (`pg_advisory_xact_lock`) pour sérialiser les mouvements de présence et l'ouverture des scrutins ;
- contrôle optimiste par `expected_version` ;
- `private.audit(...)` et `private.notify(...)` (broadcast) dans la même transaction.

**Audit chaîné**
```sql
create function private.audit(p_assembly uuid, p_action text, p_payload jsonb, p_attendee uuid default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_head public.audit_heads; v_at timestamptz := clock_timestamp(); v_hash bytea;
begin
  insert into public.audit_heads values (p_assembly, 0, '\x'::bytea) on conflict do nothing;
  select * into v_head from public.audit_heads where assembly_id = p_assembly for update;
  v_hash := extensions.digest(v_head.hash || convert_to(concat_ws('|',
              p_assembly, v_head.seq + 1,
              to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
              auth.uid(), p_attendee, p_action, p_payload::text), 'UTF8'), 'sha256');
  insert into public.audit_log(assembly_id, seq, at, actor_user_id, actor_attendee_id, action, payload, prev_hash, hash)
  values (p_assembly, v_head.seq + 1, v_at, auth.uid(), p_attendee, p_action, p_payload, v_head.hash, v_hash);
  update public.audit_heads set seq = v_head.seq + 1, hash = v_hash where assembly_id = p_assembly;
  return v_head.seq + 1;
end $$;
-- verify_audit_chain(assembly) → {ok, broken_at_seq, ballots_digest_ok[]} : recalcule la chaîne
-- et, pour chaque scrutin clos, l'empreinte des vote_events.
```

**`grant_proxy(p_grantor uuid, p_holder_attendee uuid, p_type proxy_type, p_document_path text, p_derogation_reason text default null) → uuid`**
1. Droits : organisateur (avant séance) ou bureau/accueil (en séance). L'AG ne doit être ni close ni archivée.
2. Pouvoir `blank` : le détenteur devient `president_attendee_id` si `blank_to='president'` et le président est désigné, sinon `pending`.
3. Contrôles (ils sont tous évalués, puis renvoyés ensemble dans `detail`) :
   - le mandant n'a pas déjà de pouvoir vivant (index unique) ;
   - le détenteur n'est pas le mandant lui-même ;
   - le détenteur n'est pas non éligible (`attendees.is_proxy_ineligible` ou `members.is_proxy_ineligible` de son membre) ;
   - pas de sous-délégation : le mandant n'est pas lui-même détenteur de pouvoirs actifs ;
   - nombre de pouvoirs du détenteur + 1 ≤ `max_count` ;
   - part : (voix propres du détenteur + voix des pouvoirs détenus + voix du mandant) sur la clé `share_key` ≤ `max_share` × total de la clé ;
   - ces deux plafonds sont combinés selon `combine` (`and` / `or`).
4. En cas de violation : erreur `proxy_rule_violation`, sauf si `p_derogation_reason` est fourni **et** que l'appelant est au bureau. La dérogation est alors tracée (`proxy.derogation`).
5. Si le détenteur est présent, `member_presence` du mandant passe à `represented` avec ce détenteur. Audit + broadcast `quorum`.

**`revoke_proxy(p_proxy uuid, p_reason text)`**
Statut `revoked`. La présence du mandant est recalculée (présent s'il est en salle, sinon `absent`/`expected`). La règle 5.6.4 s'applique aux scrutins ouverts. Audit + broadcast.

**`check_in(p_attendee uuid, p_signature_path text, p_expected_version int, p_new_attendee jsonb default null) → jsonb`**
1. `lock_presence`, puis contrôle de version. L'attendee passe `present`, avec horodatage et signature. Un attendee peut être créé sur place (ajout en séance, tracé).
2. Membre propre (`attendees.member_id`) : un pouvoir vivant qu'il avait donné est **révoqué** (raison `mandant_present`, 5.4). Sa présence passe à `present`.
3. Pouvoirs actifs détenus par l'attendee : leurs mandants passent à `represented`.
4. Les retardataires ne votent pas sur les scrutins déjà ouverts : ils ne figurent pas dans l'instantané, donc rien à faire.
5. `attendance_events`, audit, broadcast `quorum`. Retourne le portefeuille (voix par clé).

**`issue_voter_token(p_attendee) → text`** / **`claim_voter_token(p_token text) → jsonb`** / **`revoke_voter_token(p_attendee)`**
- `issue` révoque le jeton précédent, en génère 32 octets aléatoires, stocke leur hash, fixe l'expiration à la fin de l'AG et renvoie l'URL `/v/<token>`.
- `claim` lie `auth.uid()` (session anonyme) au jeton. Si le jeton est déjà réclamé par un autre uid, il refuse (l'accueil doit réémettre).

**`check_out(p_attendee uuid, p_mode text /*transfer|leave|temporary*/, p_transfer_to uuid, p_expected_version int) → jsonb`**
1. `lock_presence`, contrôle de version. Si `transfer`/`temporary` : le destinataire doit être présent et distinct.
2. `transfer`/`temporary` :
   - pour le membre propre : création d'un pouvoir `temporary` (`return_expected` si `temporary`), contrôlé par les mêmes règles que `grant_proxy` (fonction interne partagée `private.check_proxy_rules`) ;
   - pour les pouvoirs détenus : création de pouvoirs enfants (`parent_proxy_id`), autorisée uniquement si `allow_transfer_on_departure` (cf. B1) ;
   - si un plafond bloque : erreur `proxy_rule_violation` avec le détail, et l'UI propose une autre personne. **Tout ou rien.**
3. `leave` : les membres portés passent à `left` et sortent du décompte des présents/représentés.
4. **Scrutins ouverts (5.6.4)**, selon `settings.departure_during_ballot` :
   - défaut `transfer_unvoted` : `update ballot_eligibility set holder_attendee_id = <nouveau>` pour les membres portés qui n'ont pas encore voté. Les votes exprimés restent acquis ;
   - si `leave` : le détenteur passe à null. Le membre reste dans la base figée mais ne peut plus voter (cf. B2).
5. Événements, audit, broadcast `quorum` + `ballot`.

**`return_attendee(p_attendee, p_expected_version)`**
Révoque les pouvoirs `temporary`/enfants issus de son départ, restaure la présence et applique 5.6.4 dans l'autre sens pour les membres qui n'ont pas voté.

**`current_quorum(p_assembly uuid, p_weight_key uuid default null) → jsonb`**
Calcule par clé de répartition les poids et les têtes `present / represented / correspondence / left / expected / absent`, le total, le ratio et l'évaluation de `quorum_rule` (`reached`, détail par condition). Le calcul se fait sur `member_presence ⋈ member_weights`. Lecture seule, accessible au staff et à la projection (version agrégée).

**`open_ballot(p_resolution uuid, p_closes_at timestamptz default null) → uuid`**
```sql
-- droits : bureau ; AG 'in_session' ; vote_type <> 'information' ; mode électronique (Lot 1)
perform private.lock_presence(v_assembly);             -- instantané cohérent avec check-in/out
-- règle : un seul scrutin ouvert par AG (réglage settings.single_open_ballot, défaut true)
insert into public.ballots(resolution_id, assembly_id, rules_snapshot, opened_by, closes_at)
values (..., jsonb_build_object('majority', r.majority_rule, 'abstention', r.abstention_policy,
        'quorum', coalesce(r.quorum_rule, a.quorum_rule), 'weight_key_id', r.weight_key_id,
        'is_secret', r.is_secret, 'allow_vote_change', coalesce(r.allow_vote_change, (a.settings->>'allow_vote_change')::bool)), auth.uid(), p_closes_at)
returning id into v_ballot;
insert into public.ballot_eligibility(ballot_id, member_id, weight, presence_status, holder_attendee_id)
select v_ballot, mp.member_id, mw.weight, mp.status, mp.holder_attendee_id
from public.member_presence mp
join public.member_weights mw on mw.member_id = mp.member_id and mw.weight_key_id = r.weight_key_id
where mp.assembly_id = v_assembly and mp.status in ('present','represented','correspondence') and mw.weight > 0;
update public.ballots set totals = jsonb_build_object(
  'all_members',        (select jsonb_build_object('weight', sum(weight), 'heads', count(*)) from member_weights where weight_key_id = r.weight_key_id and weight > 0),
  'present_represented',(select jsonb_build_object('weight', sum(weight), 'heads', count(*)) from ballot_eligibility where ballot_id = v_ballot))
where id = v_ballot;
-- audit 'ballot.opened' (avec totals), broadcast 'ballot'
```

**`cast_votes(p_ballot uuid, p_items jsonb /*[{member_id, choice}]*/, p_idempotency_key uuid) → jsonb`** (chemin chaud)
```sql
-- 1. idempotence : réserve la clé ; une requête concurrente sur la même clé attend le commit puis relit
insert into public.vote_requests(idempotency_key, attendee_id, ballot_id) values (p_key, v_attendee, p_ballot)
  on conflict do nothing;
if not found then
  select response into v_resp from public.vote_requests where idempotency_key = p_key;
  if v_resp is null then raise exception using errcode='P0001', message='request_in_progress'; end if;
  return v_resp;
end if;
-- 2. rate limit léger : > 30 requêtes / 10 s pour cet attendee → 'rate_limited'
-- 3. exclusion d'une clôture concurrente sans MultiXact : verrou consultatif partagé
perform pg_advisory_xact_lock_shared(private.ballot_lock_key(p_ballot));
select * into v_ballot from public.ballots where id = p_ballot;
if v_ballot.status <> 'open' or (v_ballot.closes_at is not null and clock_timestamp() > v_ballot.closes_at)
  then raise exception using errcode='P0001', message='ballot_not_open'; end if;
-- 4. pour chaque item (tout ou rien) :
--    ligne d'instantané existante ET holder_attendee_id = attendee appelant, sinon 'member_not_held'
--    presence_status <> 'correspondence', sinon 'correspondence_vote_locked'
--    choix ∈ {for, against, abstain}, sinon 'invalid_choice'
insert into public.votes(ballot_id, member_id, assembly_id, choice, weight, cast_by_attendee_id, channel, idempotency_key)
values (p_ballot, e.member_id, v_ballot.assembly_id, v_choice, e.weight, v_attendee, 'device', p_key)
on conflict (ballot_id, member_id) do update
  set choice = excluded.choice, revision = votes.revision + 1, cast_at = clock_timestamp(),
      cast_by_attendee_id = excluded.cast_by_attendee_id, idempotency_key = excluded.idempotency_key
  where (v_ballot.rules_snapshot->>'allow_vote_change')::bool
returning revision into v_rev;
if not found then raise exception using errcode='P0001', message='vote_already_cast'; end if;
insert into public.vote_events(...);       -- historique, pas de chaîne d'audit par vote
-- 5. réponse stockée pour les réessais
update public.vote_requests set response = v_resp where idempotency_key = p_key;
return v_resp;   -- {status:'recorded', ballot_id, members:[…], at}
```

**`close_ballot(p_ballot uuid) → jsonb`**
1. Droits bureau. `pg_advisory_xact_lock(ballot_lock_key)` en exclusif : il attend la fin des votes en cours.
2. `status='closed'`, `closed_at`. `votes_digest = sha256` de la concaténation ordonnée (`vote_events.id`) des événements.
3. `compute_result`. Audit `ballot.closed` avec le digest et le résultat provisoire. Broadcast.
4. `close_expired_ballots()` est lancé par pg_cron toutes les 5 s et clôt les scrutins dont `closes_at` est passé. Entre-temps, `cast_votes` les refuse déjà.

**`compute_result(p_ballot uuid) → jsonb`**
1. Agrège `votes` par choix (poids, têtes) et calcule le reste en `not_voted`.
2. Appelle `private.evaluate_rule(rule jsonb, tallies jsonb, totals jsonb, abstention_policy text) → jsonb`, une fonction **IMMUTABLE pure** testée en pgTAP par matrice : presets × égalités × abstentions incluses ou exclues × base vide.
3. Évalue d'abord le quorum (si non atteint : `no_quorum`), puis la majorité.
4. Upsert dans `results`. Idempotent.

**`validate_result(p_ballot uuid)`**
Réservé au président (ou rôle configuré). Le scrutin doit être `closed` : il passe `validated` (`validated_by/at`). Audit `result.validated`, broadcast `result` vers la projection.

**`set_assembly_status(p_assembly, p_to assembly_status, p_reason text)`**
- Transitions autorisées : `draft→convened→in_session→closed→archived` (retour `convened→draft` interdit après envoi : Lot 2).
- Le passage `in_session` initialise `member_presence` pour tous les membres (en conservant les `represented` issus des pouvoirs avant séance dont le détenteur est déjà présent), puis attribue les pouvoirs en blanc au président.
- Le passage `closed` exige qu'aucun scrutin ne soit ouvert.

**Verrous 5.9 (migration 0013)**
- Triggers `BEFORE INSERT/UPDATE/DELETE` sur `member_weights`, `weight_keys`, `members` (poids), et sur `resolutions` dès qu'un scrutin existe.
- Si l'AG est `in_session` : refus, sauf si `current_setting('app.bureau_override', true) = 'on'`. Ce réglage est positionné uniquement par la RPC `bureau_override(p_assembly, p_action jsonb, p_reason text)` (bureau, motif obligatoire, audit).
- Si l'AG est `closed`/`archived` : refus total.
- Après convocation, toute modification de résolution incrémente `version` et écrit `resolution_versions` (trigger).

**Setup (migration 0010, plus simple)**
- `create_assembly`, `upsert_weight_key`, `upsert_member` (avec ses poids) ;
- `import_members(p_assembly, p_rows jsonb, p_dry_run bool) → rapport` : validation ligne à ligne, doublons sur `external_ref`/e-mail, poids négatifs, écarts entre le total importé et `total_declared` par clé. **Tout ou rien** ;
- `upsert_resolution`, `reorder_resolutions(p_ids uuid[])`, `set_president`, `assign_staff`, `projection_rotate_token`, `projection_state(p_token)` (anon, données publiques uniquement).

---

## 3. Découpage du Lot 1 (tâches ordonnées, un commit cohérent ou plus par tâche)

| # | Tâche | Livrable / critère de fin |
|---|---|---|
| **T0** | Bootstrap | `docs/SPEC.md` (copie du CDC), `CLAUDE.md`, Next.js App Router + TS strict + Tailwind + shadcn, ESLint/Prettier, Vitest, `supabase init`, CI GitHub Actions (lint, typecheck, vitest, `supabase start` + `supabase test db`), projet Vercel en région UE |
| **T1** | Socle SQL : enums, tenancy, helpers de droits, **audit chaîné** + append-only + `verify_audit_chain` | migrations 0001–0003 + pgTAP (chaîne valide, altération détectée, UPDATE/DELETE refusés même au service role) |
| **T2** | Auth staff (magic link), middleware, organisations, invitations, rôles, super-admin | pages login/orgs ; pgTAP d'**isolation inter-organisations** sur toutes les tables existantes |
| **T3** | AG + clés de répartition + statuts + presets | migration 0004 (+ seed `rule_presets`), `validate_rule` (SQL) ≡ schéma Zod (tests croisés sur les mêmes fixtures), UI création/paramétrage |
| **T4** | Membres + **import CSV/XLSX** | `import_members` + pgTAP ; assistant UI (upload → mapping → prévisualisation → erreurs/doublons → contrôle des totaux → rapport) ; édition manuelle |
| **T5** | Résolutions | migration 0007, RPC, versionnage, tri par glisser-déposer, éditeur Tiptap, éditeur de règle avec presets, pièces jointes Storage |
| **T6** | **Moteur présence/pouvoirs (SQL)** | migrations 0006/0011 : `grant_proxy`, `revoke_proxy`, `check_in`, `check_out` (a/b/c), `return_attendee`, `current_quorum`, `set_assembly_status` ; pgTAP exhaustif (plafonds and/or, sous-délégation, non-éligibles, blancs → président, mandant arrivant, départs) ; tests de concurrence Vitest (deux postes d'accueil sur la même personne) |
| **T7** | UI pouvoirs avant séance | saisie, import, scan du pouvoir, blancs, messages FR explicites, dérogation bureau |
| **T8** | Identité votant | `voter_tokens`, issue/claim/revoke, page `/v/[token]` (session anonyme Supabase), QR |
| **T9** | **Émargement tablette** | recherche instantanée, scan QR (BarcodeDetector + repli `@zxing/browser`), parcours d'arrivée, pad de signature → Storage, affectation du terminal (QR à scanner par le votant / tablette prêtée), départ 5.6 avec proposition d'une alternative si plafond, conflits optimistes |
| **T10** | **Moteur de scrutin (SQL)** | migration 0012 : `open_ballot`, `cast_votes`, `close_ballot`, `compute_result`, `evaluate_rule`, `validate_result`, pg_cron ; pgTAP (matrice des majorités, instantané, retardataire exclu, 5.6.4, vote modifié/interdit, idempotence) ; tests de concurrence (même clé ×N en parallèle, clôture pendant un flux de votes : aucun vote après `closed_at`, unicité) |
| **T11** | Temps réel | migration 0014 (triggers `realtime.send`, RLS `realtime.messages`), hook `useAssemblyChannel` avec bascule polling 3 s (testée en coupant le WebSocket) |
| **T12** | **Régie** | dashboard quorum par clé, terminaux connectés (Presence), ordre du jour, ouverture/clôture/minuteur, participation sans tendance, provisoire → validation → publication ; verrous 5.9 (migration 0013) + `bureau_override` |
| **T13** | **Interface votant mobile** | attente → résolution → choix → confirmation → accusé ; « même vote / vote par mandant » ; file d'envoi idempotente avec réessai exponentiel, « enregistré » affiché uniquement sur réponse serveur ; récapitulatif des voix par clé ; accessibilité (contrastes AA, cibles ≥ 48 px, ARIA, test axe) |
| **T14** | Écran de projection | `/projection/[token]`, plein écran, quorum, compte à rebours, participation, résultat validé (graphique barres) |
| **T15** | Exports | migration 0016 ; route Node : feuille de présence PDF/XLSX (avec signatures), résultats PDF/XLSX (+CSV) ; stockage, SHA-256, URL signées |
| **T16** | Données de démo + E2E | seeds copro 120 lots/3 clés, SAS 40, asso 1 500 ; Playwright : import → pouvoirs → émargement → départ avec transfert → vote multi-terminal → résultat → validation → export |
| **T17** | Charge k6 | scénarios 2 000 votants / rafale 500 votes/s à l'ouverture ; rapport p95/p99 ; optimisations (index, taille du pool) ; vérification des quotas Realtime |
| **T18** | Durcissement et clôture du lot | CSP/HSTS/CSRF, Sentry, check GitHub « gel des déploiements » (flag AG en cours), README, ARCHITECTURE, RUNBOOK (brouillon, dont le mode dégradé), déploiement preview Vercel, `docs/lots/LOT1_NOTE.md` |

Chemin critique : T0 → T1 → T3 → T4 → T6 → T10 → T12/T13. Les UI T7/T9 suivent T6, T14/T15 suivent T10.

---

## 4. Questions ouvertes

### Section 9 du CDC : celles qui bloquent le Lot 1

| # | Question | Bloquant ? | Ce qui en dépend |
|---|---|---|---|
| 1 | Types d'AG prioritaires | **Oui** (avant T3) | presets de majorité, de quorum et de pouvoirs ; jeux de démo ; formats de règles (ex. double majorité copro) |
| 2 | Taille maximale visée | **Oui** (avant T17, et pour commander le plan) | Supabase Pro limite par défaut les connexions Realtime simultanées (~500) : 2 000 votants imposent un add-on ou un plan supérieur ; calibrage k6 |
| 3 | Terminaux (smartphone perso, tablettes prêtées, les deux) | **Oui** (avant T8/T9) | modèle d'identité votant : avec des tablettes partagées, il faut un mode kiosque et une réaffectation entre personnes |
| 4 | Valeur juridique de la signature à l'écran | **Oui, sous forme de confirmation** (avant T9) | je pars sur une signature manuscrite à l'écran (image + horodatage + hash dans l'audit). Une signature qualifiée (Yousign…) changerait tout le parcours d'émargement |
| 5 | Modèle de vote secret (7.3) | **Oui, sous forme de confirmation** (avant T10) | le schéma lie le vote au membre (`unique(ballot_id, member_id)`). Un anonymat cryptographique remettrait en cause `votes`, l'unicité et la modification du vote |
| 6 | Qui opère le jour J | Non pour démarrer, **oui avant T12** | densité et garde-fous de la régie, documentation |
| 7 | Validation juriste des presets | Non pour développer, **bloquant pour la mise en production** | `rule_presets.validated_by_lawyer` |

### Ambiguïtés du CDC relevées (bloquantes pour T6/T10)

- **B1 — Conflit 5.4 / 5.6.** La sous-délégation est interdite par défaut, mais 5.6 (a) permet au partant de donner « ses voix **et ses pouvoirs** ». C'est une sous-délégation. Proposition : réglage `allow_transfer_on_departure` qui l'autorise uniquement dans ce cas, tracé. À confirmer.
- **B2 — Départ sans pouvoir pendant un scrutin ouvert.** Proposition : la base figée reste inchangée, et le membre compte comme présent non votant. À confirmer (impact direct sur les majorités calculées sur les présents/représentés).
- **B3 — Plafond de pouvoirs.** Proposition : combinaison `and`/`or` entre nombre et pourcentage (la règle copro autorise plus de 3 pouvoirs si le total reste ≤ 10 %). Pourcentage calculé sur la clé principale. À confirmer.
- **B4 — Quorum.** Proposition : quorum calculé en voix, en têtes ou les deux, par clé, en comptant les votes par correspondance (Lot 2). Si le quorum n'est pas atteint, le résultat vaut `no_quorum` plutôt que « rejeté ». À confirmer.
- **B5 — Mode dégradé (7.2).** Il suppose une saisie à main levée, prévue au Lot 2. Faut-il au minimum une saisie opérateur de secours au Lot 1 ? Proposition : non, mais la procédure papier est documentée dans le RUNBOOK.
- **B6 — Accès aux comptes.** Projets Supabase (région UE, plan Pro) et Vercel (équipe MobilActif) existants, ou à créer ? Nécessaire dès T0 pour la CI et les previews.

---

## Vérification (fin du Lot 1)

- `supabase test db` : 100 % des fonctions de la §2.6 couvertes par pgTAP, isolation RLS incluse.
- `vitest run` : unitaires et tests de concurrence (double-tap, clôture contre vote, multi-accueil).
- `playwright test` : parcours complet sur le seed copro, avec 3 contextes navigateur (accueil, régie, votants).
- `k6 run load-tests/open-ballot-burst.js` contre l'environnement de staging, avec rapport p95 < 500 ms.
- `select verify_audit_chain(<ag démo>)` renvoie `ok` après le parcours E2E.
- Déploiement preview Vercel et note `docs/lots/LOT1_NOTE.md`.
