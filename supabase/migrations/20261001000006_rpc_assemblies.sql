-- 0006 — RPC de préparation des assemblées : création, paramétrage, statut, clés, bureau.
-- Toutes les actions sont auditées dans la chaîne de l'assemblée.

-- ===== Helpers =====

-- Verrouille l'assemblée et vérifie qu'elle est modifiable par l'appelant. Une fois en
-- séance, la préparation est figée (SPEC §5.9) : les corrections passent par le bureau.
create function private.lock_assembly_for_edit(p_assembly uuid)
returns public.assemblies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if not found or not private.can_manage_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  if v_assembly.status not in ('draft', 'convened') then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  return v_assembly;
end;
$$;

create function private.preset_params(p_code text, p_kind text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_params jsonb;
begin
  select params into v_params from public.rule_presets where code = p_code and kind = p_kind;
  if v_params is null then
    perform private.fail('unknown_preset', jsonb_build_object('code', p_code));
  end if;
  return v_params;
end;
$$;

-- Presets appliqués à la création, selon la famille, la forme et le type d'AG. Ce ne sont
-- que des points de départ : l'organisateur les ajuste aux statuts.
create function private.default_preset_codes(p_family text, p_form text, p_type public.assembly_type)
returns table (quorum_code text, proxy_code text)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_family = 'company' and p_form = 'sa' and p_type = 'age' then 'sa_age_q1'
      when p_family = 'company' and p_form = 'sa' then 'sa_ago_q1'
      when p_family = 'company' and p_form = 'sarl' and p_type = 'age' then 'sarl_age_q1'
      else 'none'
    end,
    case when p_family = 'company' and p_form = 'sa' then 'company_sa' else 'unlimited' end;
$$;

create function private.assert_valid_assembly_info(
  p_title text, p_legal_family text, p_legal_form text, p_timezone text
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_title is null or length(trim(p_title)) not between 1 and 200 then
    perform private.fail('invalid_title');
  end if;
  if p_legal_family is null or p_legal_family not in ('company', 'association', 'copro', 'other') then
    perform private.fail('invalid_legal_family');
  end if;
  if p_legal_form is not null and (
       p_legal_family <> 'company' or p_legal_form not in ('sa', 'sas', 'sarl', 'sca', 'sci', 'other')) then
    perform private.fail('invalid_legal_form');
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    perform private.fail('invalid_timezone');
  end if;
end;
$$;

-- ===== Création =====
create function public.create_assembly(
  p_org uuid,
  p_title text,
  p_type public.assembly_type,
  p_legal_family text,
  p_legal_form text,
  p_starts_local timestamp,
  p_timezone text default 'Europe/Paris',
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_presets record;
  v_form text := nullif(p_legal_form, '');
begin
  if not private.has_org_role(p_org, array['org_admin', 'organizer']::public.org_role[]) then
    perform private.fail('forbidden');
  end if;
  perform private.assert_valid_assembly_info(p_title, p_legal_family, v_form, p_timezone);
  if p_starts_local is null then
    perform private.fail('invalid_starts_at');
  end if;

  select * into v_presets from private.default_preset_codes(p_legal_family, v_form, p_type);

  insert into public.assemblies (
    org_id, title, type, legal_family, legal_form, starts_at, timezone, location,
    quorum_rule, proxy_rules, created_by
  ) values (
    p_org, trim(p_title), p_type, p_legal_family, v_form,
    p_starts_local at time zone p_timezone, p_timezone, nullif(trim(p_location), ''),
    private.preset_params(v_presets.quorum_code, 'quorum'),
    private.preset_params(v_presets.proxy_code, 'proxy'),
    auth.uid()
  )
  returning id into v_id;

  -- Une clé de répartition principale est toujours présente.
  insert into public.weight_keys (assembly_id, code, label, is_primary, position)
  values (v_id, 'voix', 'Voix', true, 1);

  perform private.audit(p_org, v_id, 'assembly.created', jsonb_build_object(
    'title', trim(p_title), 'type', p_type, 'legal_family', p_legal_family, 'legal_form', v_form,
    'starts_at', p_starts_local at time zone p_timezone, 'timezone', p_timezone,
    'quorum_preset', v_presets.quorum_code, 'proxy_preset', v_presets.proxy_code));
  return v_id;
end;
$$;

-- ===== Mise à jour =====
create function public.update_assembly_info(
  p_assembly uuid,
  p_expected_version int,
  p_title text,
  p_type public.assembly_type,
  p_legal_family text,
  p_legal_form text,
  p_starts_local timestamp,
  p_timezone text,
  p_location text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_after public.assemblies;
  v_form text := nullif(p_legal_form, '');
begin
  if v_before.version <> p_expected_version then
    perform private.fail('version_conflict', jsonb_build_object('current', v_before.version));
  end if;
  perform private.assert_valid_assembly_info(p_title, p_legal_family, v_form, p_timezone);
  if p_starts_local is null then
    perform private.fail('invalid_starts_at');
  end if;

  update public.assemblies set
    title = trim(p_title),
    type = p_type,
    legal_family = p_legal_family,
    legal_form = v_form,
    starts_at = p_starts_local at time zone p_timezone,
    timezone = p_timezone,
    location = nullif(trim(p_location), ''),
    version = version + 1,
    updated_at = now()
  where id = p_assembly
  returning * into v_after;

  perform private.audit(v_after.org_id, p_assembly, 'assembly.info_updated', jsonb_build_object(
    'before', jsonb_build_object('title', v_before.title, 'type', v_before.type,
      'legal_family', v_before.legal_family, 'legal_form', v_before.legal_form,
      'starts_at', v_before.starts_at, 'timezone', v_before.timezone, 'location', v_before.location),
    'after', jsonb_build_object('title', v_after.title, 'type', v_after.type,
      'legal_family', v_after.legal_family, 'legal_form', v_after.legal_form,
      'starts_at', v_after.starts_at, 'timezone', v_after.timezone, 'location', v_after.location)));
  return v_after.version;
end;
$$;

create function public.update_assembly_rules(
  p_assembly uuid,
  p_expected_version int,
  p_quorum_rule jsonb,
  p_proxy_rules jsonb,
  p_settings jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_version int;
begin
  if v_before.version <> p_expected_version then
    perform private.fail('version_conflict', jsonb_build_object('current', v_before.version));
  end if;
  if not private.validate_rule(p_quorum_rule, 'quorum') then
    perform private.fail('invalid_quorum_rule');
  end if;
  if not private.validate_proxy_rules(p_proxy_rules) then
    perform private.fail('invalid_proxy_rules');
  end if;
  if not private.validate_settings(p_settings) then
    perform private.fail('invalid_settings');
  end if;

  update public.assemblies set
    quorum_rule = p_quorum_rule,
    proxy_rules = p_proxy_rules,
    settings = p_settings,
    version = version + 1,
    updated_at = now()
  where id = p_assembly
  returning version into v_version;

  perform private.audit(v_before.org_id, p_assembly, 'assembly.rules_updated', jsonb_build_object(
    'before', jsonb_build_object('quorum_rule', v_before.quorum_rule, 'proxy_rules', v_before.proxy_rules,
                                 'settings', v_before.settings),
    'after', jsonb_build_object('quorum_rule', p_quorum_rule, 'proxy_rules', p_proxy_rules,
                                'settings', p_settings)));
  return v_version;
end;
$$;

-- ===== Statut =====
-- Lot 1, étape T3 : brouillon ⇄ convoquée. Le passage en séance (initialisation des
-- présences) arrive avec le moteur de présence (T6), la clôture avec la régie (T12).
create function public.set_assembly_status(p_assembly uuid, p_to public.assembly_status, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_version int;
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if not found or not private.can_manage_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  if (v_assembly.status, p_to) not in (
       ('draft'::public.assembly_status, 'convened'::public.assembly_status),
       ('convened'::public.assembly_status, 'draft'::public.assembly_status)) then
    perform private.fail('transition_not_available', jsonb_build_object('from', v_assembly.status, 'to', p_to));
  end if;

  update public.assemblies set status = p_to, version = version + 1, updated_at = now()
  where id = p_assembly
  returning version into v_version;

  perform private.audit(v_assembly.org_id, p_assembly, 'assembly.status_changed', jsonb_build_object(
    'from', v_assembly.status, 'to', p_to, 'reason', nullif(trim(p_reason), '')));
  return v_version;
end;
$$;

-- ===== Clés de répartition =====
create function public.upsert_weight_key(
  p_assembly uuid,
  p_key uuid,
  p_code text,
  p_label text,
  p_total_declared numeric,
  p_is_primary boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_before public.weight_keys;
  v_id uuid;
begin
  if p_code is null or p_code !~ '^[a-z0-9_]{1,30}$' then
    perform private.fail('invalid_code');
  end if;
  if p_label is null or length(trim(p_label)) not between 1 and 100 then
    perform private.fail('invalid_label');
  end if;
  if p_total_declared is not null and p_total_declared <= 0 then
    perform private.fail('invalid_total');
  end if;
  if exists (select 1 from public.weight_keys
             where assembly_id = p_assembly and code = p_code and id is distinct from p_key) then
    perform private.fail('code_taken');
  end if;

  if p_key is not null then
    select * into v_before from public.weight_keys where id = p_key and assembly_id = p_assembly;
    if not found then
      perform private.fail('not_found');
    end if;
    if v_before.is_primary and not coalesce(p_is_primary, false) then
      perform private.fail('primary_key_required');
    end if;
  end if;

  -- Une seule clé principale : l'ancienne est rétrogradée avant de promouvoir la nouvelle.
  if coalesce(p_is_primary, false) then
    update public.weight_keys set is_primary = false
    where assembly_id = p_assembly and is_primary and id is distinct from p_key;
  end if;

  if p_key is null then
    insert into public.weight_keys (assembly_id, code, label, total_declared, is_primary, position)
    values (p_assembly, p_code, trim(p_label), p_total_declared, coalesce(p_is_primary, false),
            (select coalesce(max(position), 0) + 1 from public.weight_keys where assembly_id = p_assembly))
    returning id into v_id;
  else
    update public.weight_keys set
      code = p_code, label = trim(p_label), total_declared = p_total_declared,
      is_primary = coalesce(p_is_primary, false)
    where id = p_key
    returning id into v_id;
  end if;

  perform private.audit(v_assembly.org_id, p_assembly,
    case when p_key is null then 'weight_key.created' else 'weight_key.updated' end,
    jsonb_build_object('weight_key_id', v_id, 'code', p_code, 'label', trim(p_label),
      'total_declared', p_total_declared, 'is_primary', coalesce(p_is_primary, false),
      'before', case when p_key is null then null else to_jsonb(v_before) - 'assembly_id' end));
  return v_id;
end;
$$;

create function public.delete_weight_key(p_key uuid)
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

  delete from public.weight_keys where id = p_key;
  perform private.audit(v_assembly.org_id, v_key.assembly_id, 'weight_key.deleted',
    jsonb_build_object('weight_key_id', p_key, 'code', v_key.code, 'label', v_key.label));
end;
$$;

-- ===== Bureau et accueil =====
-- Désignés parmi les membres de l'organisation (DECISIONS B8). Possible jusqu'à la clôture.
create function public.assign_assembly_staff(p_assembly uuid, p_user uuid, p_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if not found or not private.can_manage_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  if v_assembly.status in ('closed', 'archived') then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  if not exists (select 1 from public.org_members where org_id = v_assembly.org_id and user_id = p_user) then
    perform private.fail('not_org_member');
  end if;

  insert into public.assembly_staff (assembly_id, user_id, role) values (p_assembly, p_user, p_role)
  on conflict do nothing;
  if found then
    perform private.audit(v_assembly.org_id, p_assembly, 'staff.assigned',
      jsonb_build_object('user_id', p_user, 'role', p_role));
  end if;
end;
$$;

create function public.remove_assembly_staff(p_assembly uuid, p_user uuid, p_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if not found or not private.can_manage_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  if v_assembly.status in ('closed', 'archived') then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;

  delete from public.assembly_staff where assembly_id = p_assembly and user_id = p_user and role = p_role;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.audit(v_assembly.org_id, p_assembly, 'staff.removed',
    jsonb_build_object('user_id', p_user, 'role', p_role));
end;
$$;

grant execute on function
  public.create_assembly(uuid, text, public.assembly_type, text, text, timestamp, text, text),
  public.update_assembly_info(uuid, int, text, public.assembly_type, text, text, timestamp, text, text),
  public.update_assembly_rules(uuid, int, jsonb, jsonb, jsonb),
  public.set_assembly_status(uuid, public.assembly_status, text),
  public.upsert_weight_key(uuid, uuid, text, text, numeric, boolean),
  public.delete_weight_key(uuid),
  public.assign_assembly_staff(uuid, uuid, public.staff_role),
  public.remove_assembly_staff(uuid, uuid, public.staff_role)
to authenticated;
