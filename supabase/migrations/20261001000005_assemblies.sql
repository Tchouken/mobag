-- 0005 — Assemblées, bureau/accueil, clés de répartition, règles paramétrables et presets.
--
-- Aucune règle juridique n'est codée en dur (SPEC §0.3) : quorum, majorités et règles de
-- pouvoirs sont des documents JSON validés ici et, à l'identique, par Zod
-- (lib/domain/rules.ts). Les presets sont des données (rule_presets), marqués
-- « à valider par un juriste » tant que ce n'est pas fait.

-- private.fail ne modifie rien : elle lève une erreur. La déclarer STABLE permet de
-- l'appeler depuis des fonctions STABLE sans avertissement du linter.
alter function private.fail(text, jsonb) stable;

-- ===== Validation des règles =====

-- Entier JSON strictement positif (pas de décimale, pas de chaîne), borné.
create function private.is_json_int(p_value jsonb, p_min int, p_max int)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' or p_value::text !~ '^-?[0-9]+$' then
    return false;
  end if;
  return p_value::text::numeric between p_min and p_max;
end;
$$;

-- Fraction {num, den} avec 1 ≤ num ≤ den ≤ 1000.
create function private.is_fraction(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
     or (select array_agg(k order by k collate "C") from jsonb_object_keys(p_value) k) is distinct from array['den', 'num'] then
    return false;
  end if;
  if not (private.is_json_int(p_value -> 'num', 1, 1000) and private.is_json_int(p_value -> 'den', 1, 1000)) then
    return false;
  end if;
  return (p_value ->> 'num')::int <= (p_value ->> 'den')::int;
end;
$$;

-- Règle de majorité ou de quorum : {conditions: [...], preset?}. Toutes les conditions
-- doivent être satisfaites (ET). Une condition compare une mesure (voix ou têtes) au
-- seuil num/den d'une base, au sens strict (gt) ou large (gte).
--   majority : numerator = 'for', base ∈ expressed | present_represented | all_members, 1 à 4 conditions
--   quorum   : numerator = 'present_represented', base = all_members, 0 à 4 conditions (0 = pas de quorum)
-- null est accepté (pas de règle).
create function private.validate_rule(p_rule jsonb, p_kind text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_condition jsonb;
  v_count int;
begin
  if p_rule is null then
    return true;
  end if;
  if p_kind not in ('majority', 'quorum') or jsonb_typeof(p_rule) <> 'object' then
    return false;
  end if;
  if exists (select 1 from jsonb_object_keys(p_rule) k where k not in ('conditions', 'preset')) then
    return false;
  end if;
  if p_rule ? 'preset' and (jsonb_typeof(p_rule -> 'preset') <> 'string' or length(p_rule ->> 'preset') > 64) then
    return false;
  end if;
  if jsonb_typeof(p_rule -> 'conditions') is distinct from 'array' then
    return false;
  end if;

  v_count := jsonb_array_length(p_rule -> 'conditions');
  if v_count > 4 or (p_kind = 'majority' and v_count < 1) then
    return false;
  end if;

  for v_condition in select * from jsonb_array_elements(p_rule -> 'conditions') loop
    if jsonb_typeof(v_condition) <> 'object'
       or (select array_agg(k order by k collate "C") from jsonb_object_keys(v_condition) k)
          is distinct from array['base', 'comparison', 'den', 'measure', 'num', 'numerator'] then
      return false;
    end if;
    -- coalesce : une valeur JSON null donnerait NULL, qu'une contrainte CHECK laisserait passer.
    if not coalesce(
         v_condition ->> 'measure' in ('weight', 'heads')
         and v_condition ->> 'comparison' in ('gt', 'gte')
         and private.is_json_int(v_condition -> 'num', 1, 1000)
         and private.is_json_int(v_condition -> 'den', 1, 1000),
         false) then
      return false;
    end if;
    if (v_condition ->> 'num')::int > (v_condition ->> 'den')::int then
      return false;
    end if;
    if p_kind = 'majority' and not coalesce(
         v_condition ->> 'numerator' = 'for'
         and v_condition ->> 'base' in ('expressed', 'present_represented', 'all_members'),
         false) then
      return false;
    end if;
    if p_kind = 'quorum' and not coalesce(
         v_condition ->> 'numerator' = 'present_represented'
         and v_condition ->> 'base' = 'all_members',
         false) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Règles de pouvoirs (SPEC §5.4). Toutes les clés sont obligatoires (sauf preset).
--   max_count  : nombre maximal de pouvoirs par mandataire, ou null
--   max_share  : part maximale des voix (propres + pouvoirs) sur la clé principale, ou null
--   combine    : 'and' = les deux plafonds s'appliquent ; 'or' = l'un des deux suffit (copropriété)
--   blank_to   : 'president' | 'board_recommendation' (SA, vote selon l'avis du conseil) | 'none'
create function private.validate_proxy_rules(p_rules jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    return false;
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_rules) k
    where k not in ('max_count', 'max_share', 'share_key', 'combine', 'forbid_subdelegation', 'blank_to',
                    'allow_transfer_on_departure', 'preset')
  ) or not (p_rules ?& array['max_count', 'max_share', 'share_key', 'combine', 'forbid_subdelegation',
                              'blank_to', 'allow_transfer_on_departure']) then
    return false;
  end if;
  return coalesce((jsonb_typeof(p_rules -> 'max_count') = 'null' or private.is_json_int(p_rules -> 'max_count', 1, 1000))
     and (jsonb_typeof(p_rules -> 'max_share') = 'null' or private.is_fraction(p_rules -> 'max_share'))
     and p_rules ->> 'share_key' = 'primary'
     and p_rules ->> 'combine' in ('and', 'or')
     and jsonb_typeof(p_rules -> 'forbid_subdelegation') = 'boolean'
     and p_rules ->> 'blank_to' in ('president', 'board_recommendation', 'none')
     and jsonb_typeof(p_rules -> 'allow_transfer_on_departure') = 'boolean'
     and (not p_rules ? 'preset' or (jsonb_typeof(p_rules -> 'preset') = 'string'
                                     and length(p_rules ->> 'preset') <= 64)), false);
end;
$$;

-- Réglages de séance. Toutes les clés sont obligatoires.
create function private.validate_settings(p_settings jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return false;
  end if;
  if (select array_agg(k order by k collate "C") from jsonb_object_keys(p_settings) k)
     is distinct from array['allow_vote_change', 'departure_during_ballot', 'hide_live_trend', 'single_open_ballot'] then
    return false;
  end if;
  return coalesce(jsonb_typeof(p_settings -> 'allow_vote_change') = 'boolean'
     and p_settings ->> 'departure_during_ballot' in ('transfer_unvoted', 'freeze')
     and jsonb_typeof(p_settings -> 'hide_live_trend') = 'boolean'
     and jsonb_typeof(p_settings -> 'single_open_ballot') = 'boolean', false);
end;
$$;

create function private.default_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'allow_vote_change', true,
    'departure_during_ballot', 'transfer_unvoted',
    'hide_live_trend', true,
    'single_open_ballot', true
  );
$$;

-- ===== Tables =====
create table public.rule_presets (
  code text primary key check (code ~ '^[a-z0-9_]{1,64}$'),
  kind text not null check (kind in ('majority', 'quorum', 'proxy')),
  assembly_family text not null check (assembly_family in ('generic', 'company', 'association', 'copro')),
  legal_form text,
  label_fr text not null,
  description_fr text,
  params jsonb not null,
  abstention_policy text check (abstention_policy in ('excluded', 'included')),
  legal_reference text,
  validated_by_lawyer boolean not null default false,
  position int not null default 0,
  check (
    (kind = 'majority' and private.validate_rule(params, 'majority') and abstention_policy is not null)
    or (kind = 'quorum' and private.validate_rule(params, 'quorum') and abstention_policy is null)
    or (kind = 'proxy' and private.validate_proxy_rules(params) and abstention_policy is null)
  )
);

create table public.assemblies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations,
  title text not null check (length(trim(title)) between 1 and 200),
  type public.assembly_type not null,
  mode public.assembly_mode not null default 'in_person',
  legal_family text not null check (legal_family in ('company', 'association', 'copro', 'other')),
  legal_form text check (legal_form in ('sa', 'sas', 'sarl', 'sca', 'sci', 'other')),
  status public.assembly_status not null default 'draft',
  starts_at timestamptz not null,
  timezone text not null default 'Europe/Paris',
  location text check (length(location) <= 300),
  quorum_rule jsonb check (private.validate_rule(quorum_rule, 'quorum')),
  proxy_rules jsonb not null check (private.validate_proxy_rules(proxy_rules)),
  settings jsonb not null default private.default_settings() check (private.validate_settings(settings)),
  is_rehearsal boolean not null default false,
  president_attendee_id uuid,                -- clé étrangère ajoutée avec les attendees (T6)
  version int not null default 1,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (legal_form is null or legal_family = 'company')
);
create index assemblies_org_idx on public.assemblies (org_id, starts_at desc);

alter table public.audit_log
  add constraint audit_log_assembly_fk foreign key (assembly_id) references public.assemblies;

create table public.assembly_staff (
  assembly_id uuid not null references public.assemblies on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  primary key (assembly_id, user_id, role)
);
create index assembly_staff_user_idx on public.assembly_staff (user_id);

create table public.weight_keys (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{1,30}$'),
  label text not null check (length(trim(label)) between 1 and 100),
  total_declared numeric(24, 6) check (total_declared is null or total_declared > 0),
  is_primary boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (assembly_id, code)
);
create unique index weight_keys_one_primary on public.weight_keys (assembly_id) where is_primary;

-- ===== Helpers de droits par assemblée =====

-- Préparation (création, paramétrage) : administrateurs et organisateurs de l'organisation.
create function private.can_manage_assembly(p_assembly uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assemblies a
    where a.id = p_assembly
      and private.has_org_role(a.org_id, array['org_admin', 'organizer']::public.org_role[])
  );
$$;

-- Rôle de séance (bureau, accueil) désigné pour cette assemblée. Le super-admin a tous les rôles.
create function private.has_assembly_role(p_assembly uuid, p_roles public.staff_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
      or exists (
        select 1 from public.assembly_staff s
        where s.assembly_id = p_assembly
          and s.user_id = auth.uid()
          and (p_roles is null or s.role = any (p_roles))
      );
$$;

create function private.can_read_assembly(p_assembly uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_assembly(p_assembly) or private.has_assembly_role(p_assembly);
$$;

grant execute on function
  private.can_manage_assembly(uuid),
  private.has_assembly_role(uuid, public.staff_role[]),
  private.can_read_assembly(uuid)
to authenticated, service_role;

-- ===== RLS =====
alter table public.rule_presets enable row level security;
alter table public.rule_presets force row level security;
alter table public.assemblies enable row level security;
alter table public.assemblies force row level security;
alter table public.assembly_staff enable row level security;
alter table public.assembly_staff force row level security;
alter table public.weight_keys enable row level security;
alter table public.weight_keys force row level security;

create policy rule_presets_select on public.rule_presets for select to authenticated using (true);
create policy assemblies_select on public.assemblies for select to authenticated
  using (private.has_org_role(org_id) or private.has_assembly_role(id));
create policy assembly_staff_select on public.assembly_staff for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy weight_keys_select on public.weight_keys for select to authenticated
  using (private.can_read_assembly(assembly_id));

grant select on public.rule_presets, public.assemblies, public.assembly_staff, public.weight_keys
  to authenticated, service_role;

-- ===== Presets (à valider par un juriste avant production : validated_by_lawyer = false) =====
-- Ordre de priorité retenu (DECISIONS Q1) : sociétés, associations, puis copropriétés.
insert into public.rule_presets
  (code, kind, assembly_family, legal_form, label_fr, description_fr, params, abstention_policy, legal_reference, position)
values
  -- Majorités génériques
  ('simple_expressed', 'majority', 'generic', null,
   'Majorité simple des voix exprimées', 'Plus de voix « pour » que de voix « contre ».',
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}], "preset": "simple_expressed"}',
   'excluded', null, 10),
  ('absolute_present', 'majority', 'generic', null,
   'Majorité absolue des présents et représentés', 'Plus de la moitié des voix des présents et représentés.',
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "present_represented", "num": 1, "den": 2, "comparison": "gt"}], "preset": "absolute_present"}',
   'excluded', null, 20),
  ('absolute_all', 'majority', 'generic', null,
   'Majorité absolue de tous les membres', 'Plus de la moitié de toutes les voix, présentes ou non.',
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "all_members", "num": 1, "den": 2, "comparison": "gt"}], "preset": "absolute_all"}',
   'excluded', null, 30),
  ('qualified_2_3_expressed', 'majority', 'generic', null,
   'Majorité des 2/3 des voix exprimées', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 2, "den": 3, "comparison": "gte"}], "preset": "qualified_2_3_expressed"}',
   'excluded', null, 40),
  ('qualified_3_4_expressed', 'majority', 'generic', null,
   'Majorité des 3/4 des voix exprimées', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 3, "den": 4, "comparison": "gte"}], "preset": "qualified_3_4_expressed"}',
   'excluded', null, 50),
  ('unanimity_present', 'majority', 'generic', null,
   'Unanimité des présents et représentés', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "present_represented", "num": 1, "den": 1, "comparison": "gte"}], "preset": "unanimity_present"}',
   'included', null, 60),
  ('unanimity_all', 'majority', 'generic', null,
   'Unanimité de tous les membres', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "all_members", "num": 1, "den": 1, "comparison": "gte"}], "preset": "unanimity_all"}',
   'included', null, 70),

  -- Sociétés anonymes
  ('sa_ago', 'majority', 'company', 'sa',
   'SA — AGO : majorité des voix exprimées', 'Abstentions, blancs et nuls ne sont pas des voix exprimées.',
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}], "preset": "sa_ago"}',
   'excluded', 'C. com. art. L225-98', 100),
  ('sa_age', 'majority', 'company', 'sa',
   'SA — AGE : 2/3 des voix exprimées', 'Abstentions, blancs et nuls ne sont pas des voix exprimées.',
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 2, "den": 3, "comparison": "gte"}], "preset": "sa_age"}',
   'excluded', 'C. com. art. L225-96', 110),
  -- SARL
  ('sarl_ago_1', 'majority', 'company', 'sarl',
   'SARL — décision ordinaire, 1re consultation : plus de la moitié des parts sociales', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "all_members", "num": 1, "den": 2, "comparison": "gt"}], "preset": "sarl_ago_1"}',
   'excluded', 'C. com. art. L223-29', 120),
  ('sarl_ago_2', 'majority', 'company', 'sarl',
   'SARL — décision ordinaire, 2e consultation : majorité des votes émis', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}], "preset": "sarl_ago_2"}',
   'excluded', 'C. com. art. L223-29', 130),
  ('sarl_age', 'majority', 'company', 'sarl',
   'SARL — décision extraordinaire (après 2005) : 2/3 des parts des présents et représentés', null,
   '{"conditions": [{"measure": "weight", "numerator": "for", "base": "present_represented", "num": 2, "den": 3, "comparison": "gte"}], "preset": "sarl_age"}',
   'excluded', 'C. com. art. L223-30', 140),
  -- Associations (règles fixées par les statuts : presets de départ)
  ('asso_simple', 'majority', 'association', null,
   'Association — majorité simple des suffrages exprimés', 'À vérifier selon les statuts.',
   '{"conditions": [{"measure": "heads", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}], "preset": "asso_simple"}',
   'excluded', 'Statuts', 200),
  ('asso_2_3', 'majority', 'association', null,
   'Association — 2/3 des suffrages exprimés', 'À vérifier selon les statuts.',
   '{"conditions": [{"measure": "heads", "numerator": "for", "base": "expressed", "num": 2, "den": 3, "comparison": "gte"}], "preset": "asso_2_3"}',
   'excluded', 'Statuts', 210),

  -- Quorums
  ('none', 'quorum', 'generic', null,
   'Pas de quorum', null, '{"conditions": [], "preset": "none"}', null, null, 10),
  ('sa_ago_q1', 'quorum', 'company', 'sa',
   'SA — AGO, 1re convocation : 1/5 des actions ayant droit de vote', null,
   '{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 5, "comparison": "gte"}], "preset": "sa_ago_q1"}',
   null, 'C. com. art. L225-98', 100),
  ('sa_age_q1', 'quorum', 'company', 'sa',
   'SA — AGE, 1re convocation : 1/4 des actions ayant droit de vote', null,
   '{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 4, "comparison": "gte"}], "preset": "sa_age_q1"}',
   null, 'C. com. art. L225-96', 110),
  ('sa_age_q2', 'quorum', 'company', 'sa',
   'SA — AGE, 2e convocation : 1/5 des actions ayant droit de vote', null,
   '{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 5, "comparison": "gte"}], "preset": "sa_age_q2"}',
   null, 'C. com. art. L225-96', 120),
  ('sarl_age_q1', 'quorum', 'company', 'sarl',
   'SARL — AGE, 1re convocation : 1/4 des parts', null,
   '{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 4, "comparison": "gte"}], "preset": "sarl_age_q1"}',
   null, 'C. com. art. L223-30', 130),
  ('sarl_age_q2', 'quorum', 'company', 'sarl',
   'SARL — AGE, 2e convocation : 1/5 des parts', null,
   '{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 5, "comparison": "gte"}], "preset": "sarl_age_q2"}',
   null, 'C. com. art. L223-30', 140),
  ('heads_quarter', 'quorum', 'association', null,
   'Association — 1/4 des membres présents ou représentés', 'À vérifier selon les statuts.',
   '{"conditions": [{"measure": "heads", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 4, "comparison": "gte"}], "preset": "heads_quarter"}',
   null, 'Statuts', 200),
  ('heads_half', 'quorum', 'association', null,
   'Association — la moitié des membres présents ou représentés', 'À vérifier selon les statuts.',
   '{"conditions": [{"measure": "heads", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 2, "comparison": "gte"}], "preset": "heads_half"}',
   null, 'Statuts', 210),

  -- Pouvoirs
  ('unlimited', 'proxy', 'generic', null,
   'Sans plafond — pouvoirs en blanc au président', 'Sous-délégation interdite.',
   '{"max_count": null, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true, "preset": "unlimited"}',
   null, null, 10),
  ('company_sa', 'proxy', 'company', 'sa',
   'SA — pouvoirs en blanc : vote selon l''avis du conseil', 'Le président vote pour les projets agréés par le conseil, contre les autres.',
   '{"max_count": null, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "board_recommendation", "allow_transfer_on_departure": true, "preset": "company_sa"}',
   null, 'C. com. art. L225-106', 100),
  ('asso_cap_2', 'proxy', 'association', null,
   'Association — 2 pouvoirs maximum par mandataire', 'À vérifier selon les statuts.',
   '{"max_count": 2, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true, "preset": "asso_cap_2"}',
   null, 'Statuts', 200);
