-- 0007 — Membres (titulaires de droits), voix par clé de répartition, import en masse.
--
-- L'import est validé intégralement en base : le client ne fait que lire le fichier et
-- associer les colonnes. Tout ou rien : la moindre erreur bloque l'écriture. Un mode
-- « à blanc » renvoie le même rapport sans rien écrire (prévisualisation).

create table public.members (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  kind public.member_kind not null,
  display_name text not null check (length(display_name) between 1 and 200),
  last_name text check (length(last_name) <= 100),
  first_name text check (length(first_name) <= 100),
  company_name text check (length(company_name) <= 200),
  external_ref text check (length(external_ref) <= 50),
  email extensions.citext check (length(email) <= 254),
  phone text check (length(phone) <= 30),
  representative_name text check (length(representative_name) <= 200),
  is_proxy_ineligible boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assembly_id, external_ref),
  unique (id, assembly_id)
);
create index members_assembly_name_idx on public.members (assembly_id, display_name);

-- Clés composites : une voix ne peut référencer qu'un membre et une clé de la même AG.
alter table public.weight_keys add constraint weight_keys_id_assembly_uniq unique (id, assembly_id);

create table public.member_weights (
  member_id uuid not null,
  weight_key_id uuid not null,
  assembly_id uuid not null,
  weight numeric(24, 6) not null check (weight >= 0),
  primary key (member_id, weight_key_id),
  foreign key (member_id, assembly_id) references public.members (id, assembly_id) on delete cascade,
  foreign key (weight_key_id, assembly_id) references public.weight_keys (id, assembly_id) on delete cascade
);
create index member_weights_key_idx on public.member_weights (weight_key_id) include (weight);

-- Totaux par clé (voix importées, membres concernés) comparés au total déclaré.
-- security_invoker : la RLS des tables sous-jacentes s'applique à l'appelant.
create view public.weight_key_totals with (security_invoker = true) as
select
  k.id as weight_key_id,
  k.assembly_id,
  k.code,
  k.label,
  k.is_primary,
  k.position,
  k.total_declared,
  coalesce(sum(mw.weight), 0)::numeric(24, 6) as total_imported,
  count(mw.member_id) filter (where mw.weight > 0)::int as members_with_weight
from public.weight_keys k
left join public.member_weights mw on mw.weight_key_id = k.id
group by k.id;

alter table public.members enable row level security;
alter table public.members force row level security;
alter table public.member_weights enable row level security;
alter table public.member_weights force row level security;

create policy members_select on public.members for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy member_weights_select on public.member_weights for select to authenticated
  using (private.can_read_assembly(assembly_id));

grant select on public.members, public.member_weights, public.weight_key_totals to authenticated, service_role;

-- ===== Validation d'une ligne =====

-- Voix : nombre JSON ou chaîne décimale (point comme séparateur, 6 décimales max).
-- Renvoie null si la valeur est invalide.
create function private.parse_weight(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return 0;
  end if;
  if jsonb_typeof(p_value) = 'number' then
    v_text := p_value::text;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := trim(p_value #>> '{}');
    if v_text = '' then
      return 0;
    end if;
  else
    return null;
  end if;
  if v_text !~ '^-?[0-9]{1,18}(\.[0-9]{1,6})?$' then
    return null;
  end if;
  return v_text::numeric;
end;
$$;

create function private.clean_text(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(trim(p_value #>> '{}'), '\s+', ' ', 'g'), '');
$$;

-- Valide et normalise une ligne de membre. Renvoie {member, errors, warnings}.
--   p_key_codes : codes des clés de répartition de l'AG.
create function private.check_member_row(p_row jsonb, p_key_codes text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_kind text := private.clean_text(p_row -> 'kind');
  v_last text := private.clean_text(p_row -> 'last_name');
  v_first text := private.clean_text(p_row -> 'first_name');
  v_company text := private.clean_text(p_row -> 'company_name');
  v_display text := private.clean_text(p_row -> 'display_name');
  v_ref text := private.clean_text(p_row -> 'external_ref');
  v_email text := lower(private.clean_text(p_row -> 'email'));
  v_phone text := private.clean_text(p_row -> 'phone');
  v_rep text := private.clean_text(p_row -> 'representative_name');
  v_ineligible jsonb := coalesce(p_row -> 'is_proxy_ineligible', 'false'::jsonb);
  v_weights jsonb := '{}'::jsonb;
  v_code text;
  v_value numeric;
begin
  if jsonb_typeof(p_row) is distinct from 'object' then
    return jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('field', null, 'code', 'invalid_row')),
                              'warnings', '[]');
  end if;

  -- Nature : explicite, ou déduite (raison sociale sans nom de famille → personne morale).
  if v_kind is null then
    v_kind := case when v_company is not null and v_last is null then 'legal_entity' else 'person' end;
  elsif v_kind not in ('person', 'legal_entity') then
    v_errors := v_errors || jsonb_build_object('field', 'kind', 'code', 'invalid_kind');
    v_kind := 'person';
  end if;

  -- Nom affiché : explicite, sinon « NOM Prénom » ou la raison sociale.
  v_display := coalesce(v_display,
    case when v_kind = 'legal_entity' then v_company
         else nullif(trim(concat_ws(' ', upper(v_last), v_first)), '') end,
    v_company);
  if v_display is null then
    v_errors := v_errors || jsonb_build_object('field', 'display_name', 'code', 'missing_name');
  end if;

  if length(v_display) > 200 or length(v_last) > 100 or length(v_first) > 100 or length(v_company) > 200
     or length(v_rep) > 200 then
    v_errors := v_errors || jsonb_build_object('field', 'display_name', 'code', 'field_too_long');
  end if;
  if length(v_ref) > 50 then
    v_errors := v_errors || jsonb_build_object('field', 'external_ref', 'code', 'field_too_long');
  end if;
  if length(v_phone) > 30 then
    v_errors := v_errors || jsonb_build_object('field', 'phone', 'code', 'field_too_long');
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254) then
    v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'invalid_email', 'value', v_email);
  end if;
  if jsonb_typeof(v_ineligible) <> 'boolean' then
    v_errors := v_errors || jsonb_build_object('field', 'is_proxy_ineligible', 'code', 'invalid_boolean');
    v_ineligible := 'false'::jsonb;
  end if;

  -- Voix : une valeur par clé de l'AG (0 si absente). Une clé inconnue est une erreur.
  if p_row ? 'weights' and jsonb_typeof(p_row -> 'weights') <> 'object' then
    v_errors := v_errors || jsonb_build_object('field', 'weights', 'code', 'invalid_weight');
  else
    for v_code in select jsonb_object_keys(coalesce(p_row -> 'weights', '{}')) loop
      if not v_code = any (p_key_codes) then
        v_errors := v_errors || jsonb_build_object('field', 'weights.' || v_code, 'code', 'unknown_weight_key');
      end if;
    end loop;
    foreach v_code in array p_key_codes loop
      v_value := private.parse_weight(p_row -> 'weights' -> v_code);
      if v_value is null then
        v_errors := v_errors || jsonb_build_object('field', 'weights.' || v_code, 'code', 'invalid_weight',
                                                   'value', p_row -> 'weights' -> v_code);
        v_value := 0;
      elsif v_value < 0 then
        v_errors := v_errors || jsonb_build_object('field', 'weights.' || v_code, 'code', 'negative_weight',
                                                   'value', v_value);
        v_value := 0;
      end if;
      v_weights := v_weights || jsonb_build_object(v_code, v_value);
    end loop;
    if not exists (select 1 from jsonb_each_text(v_weights) w where w.value::numeric > 0) then
      v_warnings := v_warnings || jsonb_build_object('field', 'weights', 'code', 'no_voting_rights');
    end if;
  end if;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'kind', v_kind, 'display_name', v_display, 'last_name', v_last, 'first_name', v_first,
      'company_name', v_company, 'external_ref', v_ref, 'email', v_email, 'phone', v_phone,
      'representative_name', v_rep, 'is_proxy_ineligible', v_ineligible, 'weights', v_weights),
    'errors', v_errors,
    'warnings', v_warnings);
end;
$$;

-- ===== Import en masse =====
-- p_rows   : [{line, kind?, display_name?, last_name?, first_name?, company_name?, external_ref?, email?,
--             phone?, representative_name?, is_proxy_ineligible?, weights: {code: valeur}}]
-- p_mode   : 'append' (ajout ; une référence déjà connue est une erreur)
--            'upsert' (mise à jour des membres de même référence, ajout des autres)
--            'replace' (remplace tous les membres de l'AG)
-- p_source : {filename, sha256} — tracé dans l'audit.
create function public.import_members(
  p_assembly uuid,
  p_rows jsonb,
  p_mode text,
  p_dry_run boolean,
  p_source jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_codes text[];
  v_parsed jsonb;
  v_errors jsonb;
  v_warnings jsonb;
  v_totals jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_count int;
  v_max_rows constant int := 20000;
begin
  if p_mode is null or p_mode not in ('append', 'upsert', 'replace') then
    perform private.fail('invalid_import_mode');
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    perform private.fail('invalid_import_rows');
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count = 0 then
    perform private.fail('empty_import');
  end if;
  if v_count > v_max_rows then
    perform private.fail('too_many_rows', jsonb_build_object('max', v_max_rows));
  end if;

  select array_agg(code order by position) into v_codes from public.weight_keys where assembly_id = p_assembly;

  -- 1. Validation ligne à ligne, ensembliste (pas de concaténation en boucle : 20 000 lignes
  --    doivent passer en quelques secondes).
  select jsonb_agg(jsonb_build_object(
      'line', case when r.value ->> 'line' ~ '^[0-9]{1,9}$' then (r.value ->> 'line')::int else r.ordinality::int end,
      'member', c.chk -> 'member',
      'errors', c.chk -> 'errors',
      'warnings', c.chk -> 'warnings',
      'id', gen_random_uuid()) order by r.ordinality)
  into v_parsed
  from jsonb_array_elements(p_rows) with ordinality as r
  -- Appel dans le FROM : une seule évaluation par ligne (une sous-requête scalaire serait
  -- aplatie par le planificateur et la validation recalculée pour chaque champ extrait).
  cross join lateral private.check_member_row(r.value, v_codes) as c(chk);

  select coalesce(jsonb_agg(e.value || jsonb_build_object('line', ir.line) order by ir.line), '[]')
  into v_errors
  from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid), jsonb_array_elements(ir.errors) e;

  select coalesce(jsonb_agg(w.value || jsonb_build_object('line', ir.line) order by ir.line), '[]')
  into v_warnings
  from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid), jsonb_array_elements(ir.warnings) w;

  -- 2. Contrôles sur l'ensemble du fichier.
  -- Référence en double dans le fichier : erreur sur chaque ligne concernée.
  v_errors := v_errors || coalesce((
    select jsonb_agg(jsonb_build_object('line', ir.line, 'field', 'external_ref', 'code', 'duplicate_ref',
                                        'value', ir.member ->> 'external_ref') order by ir.line)
    from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid)
    where ir.member ->> 'external_ref' in (
      select ir2.member ->> 'external_ref' from jsonb_to_recordset(v_parsed) as ir2(member jsonb)
      where ir2.member ->> 'external_ref' is not null
      group by 1 having count(*) > 1)), '[]');

  -- Même e-mail sur plusieurs lignes : avertissement (indivisaires, représentant commun…).
  v_warnings := v_warnings || coalesce((
    select jsonb_agg(jsonb_build_object('line', ir.line, 'field', 'email', 'code', 'duplicate_email',
                                        'value', ir.member ->> 'email') order by ir.line)
    from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid)
    where ir.member ->> 'email' in (
      select ir2.member ->> 'email' from jsonb_to_recordset(v_parsed) as ir2(member jsonb)
      where ir2.member ->> 'email' is not null
      group by 1 having count(*) > 1)), '[]');

  -- Ajout simple : une référence déjà présente dans l'AG est une erreur.
  if p_mode = 'append' then
    v_errors := v_errors || coalesce((
      select jsonb_agg(jsonb_build_object('line', ir.line, 'field', 'external_ref', 'code', 'ref_exists',
                                          'value', ir.member ->> 'external_ref') order by ir.line)
      from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid)
      join public.members e on e.assembly_id = p_assembly and e.external_ref = ir.member ->> 'external_ref'), '[]');
  end if;

  -- 3. Totaux projetés par clé (membres conservés + fichier) comparés au total déclaré.
  with kept as (
    select mw.weight_key_id, sum(mw.weight) as total, count(*) filter (where mw.weight > 0) as n
    from public.member_weights mw
    join public.members m on m.id = mw.member_id
    where m.assembly_id = p_assembly
      and p_mode <> 'replace'
      and not (p_mode = 'upsert' and m.external_ref is not null and exists (
        select 1 from jsonb_to_recordset(v_parsed) as ir(member jsonb) where ir.member ->> 'external_ref' = m.external_ref))
    group by mw.weight_key_id
  ),
  imported as (
    select w.key as code, sum(w.value::numeric) as total, count(*) filter (where w.value::numeric > 0) as n
    from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid), jsonb_each_text(ir.member -> 'weights') w
    group by w.key
  )
  select jsonb_agg(jsonb_build_object(
      'code', k.code, 'label', k.label, 'declared', k.total_declared,
      'projected', coalesce(i.total, 0) + coalesce(kept.total, 0),
      'members_with_weight', coalesce(i.n, 0) + coalesce(kept.n, 0))
    order by k.position)
  into v_totals
  from public.weight_keys k
  left join imported i on i.code = k.code
  left join kept on kept.weight_key_id = k.id
  where k.assembly_id = p_assembly;

  v_warnings := v_warnings || coalesce((
    select jsonb_agg(jsonb_build_object('line', null, 'field', 'weights.' || (t ->> 'code'), 'code', 'total_mismatch',
      'declared', t -> 'declared', 'projected', t -> 'projected',
      'difference', (t ->> 'projected')::numeric - (t ->> 'declared')::numeric))
    from jsonb_array_elements(v_totals) t
    where t ->> 'declared' is not null and (t ->> 'declared')::numeric <> (t ->> 'projected')::numeric), '[]');

  -- 4. Écriture (tout ou rien).
  if jsonb_array_length(v_errors) = 0 and not p_dry_run then
    if p_mode = 'replace' then
      delete from public.members where assembly_id = p_assembly;
    end if;

    with written as (
      insert into public.members as m (
        id, assembly_id, kind, display_name, last_name, first_name, company_name, external_ref, email, phone,
        representative_name, is_proxy_ineligible)
      select ir.id, p_assembly, (ir.member ->> 'kind')::public.member_kind, ir.member ->> 'display_name',
             ir.member ->> 'last_name', ir.member ->> 'first_name', ir.member ->> 'company_name',
             ir.member ->> 'external_ref', ir.member ->> 'email', ir.member ->> 'phone',
             ir.member ->> 'representative_name', (ir.member ->> 'is_proxy_ineligible')::boolean
      from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid)
      order by ir.line
      on conflict (assembly_id, external_ref) do update set
        kind = excluded.kind, display_name = excluded.display_name, last_name = excluded.last_name,
        first_name = excluded.first_name, company_name = excluded.company_name, email = excluded.email,
        phone = excluded.phone, representative_name = excluded.representative_name,
        is_proxy_ineligible = excluded.is_proxy_ineligible, version = m.version + 1, updated_at = now()
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_inserted, v_updated from written;

    -- Voix : membre résolu par référence (mise à jour) ou par l'identifiant pré-généré.
    insert into public.member_weights (member_id, weight_key_id, assembly_id, weight)
    select coalesce(existing.id, ir.id), k.id, p_assembly, w.value::numeric
    from jsonb_to_recordset(v_parsed) as ir(line int, member jsonb, errors jsonb, warnings jsonb, id uuid)
    cross join lateral jsonb_each_text(ir.member -> 'weights') w
    join public.weight_keys k on k.assembly_id = p_assembly and k.code = w.key
    left join public.members existing
      on existing.assembly_id = p_assembly and existing.external_ref = ir.member ->> 'external_ref'
    on conflict (member_id, weight_key_id) do update set weight = excluded.weight;

    perform private.audit(v_assembly.org_id, p_assembly, 'members.imported', jsonb_build_object(
      'mode', p_mode, 'rows', v_count, 'inserted', v_inserted, 'updated', v_updated,
      'source', coalesce(p_source, '{}'), 'totals', v_totals, 'warnings', jsonb_array_length(v_warnings)));
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'dry_run', p_dry_run,
    'mode', p_mode,
    'rows', v_count,
    'inserted', v_inserted,
    'updated', v_updated,
    'error_count', jsonb_array_length(v_errors),
    'errors', coalesce((select jsonb_agg(e) from (
      select e from jsonb_array_elements(v_errors) e order by (e ->> 'line')::int nulls first limit 500) s), '[]'),
    'warning_count', jsonb_array_length(v_warnings),
    'warnings', coalesce((select jsonb_agg(w) from (
      select w from jsonb_array_elements(v_warnings) w order by (w ->> 'line')::int nulls first limit 500) s), '[]'),
    'totals', coalesce(v_totals, '[]'));
end;
$$;

-- ===== Édition unitaire =====
create function public.upsert_member(
  p_assembly uuid,
  p_member uuid,
  p_row jsonb,
  p_expected_version int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_codes text[];
  v_check jsonb;
  v_member jsonb;
  v_before public.members;
  v_id uuid;
begin
  select array_agg(code order by position) into v_codes from public.weight_keys where assembly_id = p_assembly;
  v_check := private.check_member_row(p_row, v_codes);
  if jsonb_array_length(v_check -> 'errors') > 0 then
    perform private.fail('invalid_member', v_check -> 'errors');
  end if;
  v_member := v_check -> 'member';

  if exists (select 1 from public.members where assembly_id = p_assembly
             and external_ref = v_member ->> 'external_ref' and id is distinct from p_member) then
    perform private.fail('ref_exists', jsonb_build_object('external_ref', v_member ->> 'external_ref'));
  end if;

  if p_member is null then
    insert into public.members (assembly_id, kind, display_name, last_name, first_name, company_name, external_ref,
                                email, phone, representative_name, is_proxy_ineligible)
    values (p_assembly, (v_member ->> 'kind')::public.member_kind, v_member ->> 'display_name',
            v_member ->> 'last_name', v_member ->> 'first_name', v_member ->> 'company_name',
            v_member ->> 'external_ref', v_member ->> 'email', v_member ->> 'phone',
            v_member ->> 'representative_name', (v_member ->> 'is_proxy_ineligible')::boolean)
    returning id into v_id;
  else
    select * into v_before from public.members where id = p_member and assembly_id = p_assembly for update;
    if not found then
      perform private.fail('not_found');
    end if;
    if p_expected_version is not null and v_before.version <> p_expected_version then
      perform private.fail('version_conflict', jsonb_build_object('current', v_before.version));
    end if;
    update public.members set
      kind = (v_member ->> 'kind')::public.member_kind, display_name = v_member ->> 'display_name',
      last_name = v_member ->> 'last_name', first_name = v_member ->> 'first_name',
      company_name = v_member ->> 'company_name', external_ref = v_member ->> 'external_ref',
      email = v_member ->> 'email', phone = v_member ->> 'phone',
      representative_name = v_member ->> 'representative_name',
      is_proxy_ineligible = (v_member ->> 'is_proxy_ineligible')::boolean,
      version = version + 1, updated_at = now()
    where id = p_member
    returning id into v_id;
  end if;

  insert into public.member_weights (member_id, weight_key_id, assembly_id, weight)
  select v_id, k.id, p_assembly, (v_member -> 'weights' ->> k.code)::numeric
  from public.weight_keys k where k.assembly_id = p_assembly
  on conflict (member_id, weight_key_id) do update set weight = excluded.weight;

  perform private.audit(v_assembly.org_id, p_assembly,
    case when p_member is null then 'member.created' else 'member.updated' end,
    jsonb_build_object('member_id', v_id, 'after', v_member,
                       'before', case when p_member is null then null else to_jsonb(v_before) end));
  return v_id;
end;
$$;

create function public.delete_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_assembly public.assemblies;
begin
  select * into v_member from public.members where id = p_member;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_edit(v_member.assembly_id);

  delete from public.members where id = p_member;
  perform private.audit(v_assembly.org_id, v_member.assembly_id, 'member.deleted',
    jsonb_build_object('member_id', p_member, 'display_name', v_member.display_name,
                       'external_ref', v_member.external_ref));
end;
$$;

-- Une clé portant des voix ne se supprime plus : ce serait effacer des droits de vote.
create or replace function public.delete_weight_key(p_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.weight_keys;
  v_assembly public.assemblies;
begin
  select * into v_key from public.weight_keys where id = p_key;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_edit(v_key.assembly_id);
  if v_key.is_primary then
    perform private.fail('primary_key_required');
  end if;
  if exists (select 1 from public.member_weights where weight_key_id = p_key and weight > 0) then
    perform private.fail('weight_key_in_use');
  end if;

  delete from public.weight_keys where id = p_key;
  perform private.audit(v_assembly.org_id, v_key.assembly_id, 'weight_key.deleted',
    jsonb_build_object('weight_key_id', p_key, 'code', v_key.code, 'label', v_key.label));
end;
$$;

grant execute on function
  public.import_members(uuid, jsonb, text, boolean, jsonb),
  public.upsert_member(uuid, uuid, jsonb, int),
  public.delete_member(uuid)
to authenticated;
