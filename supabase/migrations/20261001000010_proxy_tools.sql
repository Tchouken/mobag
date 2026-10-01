-- 0010 — Outils de saisie des pouvoirs : désignation du mandataire en une transaction,
-- import en masse, scans des pouvoirs signés, synthèse des plafonds par mandataire.

-- ===== Résolution du mandataire =====
-- p_holder : {attendee_id} | {member_id} | {member_ref} | {full_name, email?}
--   membre : la personne qui le porte en propre, créée si besoin (représentant pour une personne morale)
--   tiers  : créé ; avec p_match_existing, une personne sans membre de même nom est réutilisée (import)
create function private.resolve_proxy_holder(p_assembly uuid, p_holder jsonb, p_match_existing boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_attendee uuid;
  v_name text;
begin
  if jsonb_typeof(p_holder) is distinct from 'object' then
    perform private.fail('invalid_holder');
  end if;

  if p_holder ? 'attendee_id' then
    select id into v_attendee from public.attendees
    where id = private.try_uuid(p_holder ->> 'attendee_id') and assembly_id = p_assembly;
    if v_attendee is null then
      perform private.fail('holder_not_found');
    end if;
    return v_attendee;
  end if;

  if p_holder ? 'member_id' or p_holder ? 'member_ref' then
    select * into v_member from public.members
    where assembly_id = p_assembly
      and (id = private.try_uuid(p_holder ->> 'member_id') or external_ref = nullif(trim(p_holder ->> 'member_ref'), ''));
    if not found then
      perform private.fail('holder_not_found', jsonb_build_object('member_ref', p_holder ->> 'member_ref'));
    end if;
    select attendee_id into v_attendee from public.attendee_members where member_id = v_member.id;
    if v_attendee is null then
      v_attendee := public.upsert_attendee(p_assembly, null,
        case when v_member.kind = 'legal_entity' then coalesce(v_member.representative_name, v_member.display_name)
             else v_member.display_name end,
        v_member.email, v_member.phone, array[v_member.id], false);
    end if;
    return v_attendee;
  end if;

  v_name := nullif(regexp_replace(trim(p_holder ->> 'full_name'), '\s+', ' ', 'g'), '');
  if v_name is null then
    perform private.fail('invalid_holder');
  end if;
  if p_match_existing then
    select a.id into v_attendee from public.attendees a
    where a.assembly_id = p_assembly and lower(a.full_name) = lower(v_name)
      and not exists (select 1 from public.attendee_members am where am.attendee_id = a.id)
    order by a.created_at limit 1;
    if v_attendee is not null then
      return v_attendee;
    end if;
  end if;
  return public.upsert_attendee(p_assembly, null, v_name, p_holder ->> 'email', p_holder ->> 'phone', null, false);
end;
$$;

-- Saisie d'un pouvoir avec désignation du mandataire, en une seule transaction.
create function public.grant_proxy_to(
  p_assembly uuid,
  p_grantor uuid,
  p_holder jsonb,
  p_type public.proxy_type,
  p_derogation_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holder uuid;
begin
  perform private.lock_assembly_for_operation(p_assembly, array['draft', 'convened', 'in_session']::public.assembly_status[]);
  if p_type <> 'blank' then
    v_holder := private.resolve_proxy_holder(p_assembly, p_holder, false);
  end if;
  return public.grant_proxy(p_assembly, p_grantor, v_holder, p_type, null, p_derogation_reason);
end;
$$;

-- ===== Import en masse =====
-- p_rows : [{line, grantor_ref, holder_ref?, holder_name?, holder_email?, type: named|blank}]
-- Chaque ligne passe par grant_proxy (mêmes contrôles, plafonds cumulés dans l'ordre du fichier).
-- Tout ou rien : à la moindre erreur, ou à blanc, rien n'est conservé ; le rapport détaille
-- chaque ligne refusée.
create function public.import_proxies(p_assembly uuid, p_rows jsonb, p_dry_run boolean, p_source jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_operation(p_assembly,
    array['draft', 'convened', 'in_session']::public.assembly_status[]);
  v_row jsonb;
  v_index int := 0;
  v_line int;
  v_errors jsonb := '[]'::jsonb;
  v_created int := 0;
  v_grantor uuid;
  v_holder jsonb;
  v_type text;
  v_message text;
  v_detail text;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    perform private.fail('empty_import');
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    perform private.fail('too_many_rows', jsonb_build_object('max', 5000));
  end if;

  begin
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_index := v_index + 1;
      v_line := case when v_row ->> 'line' ~ '^[0-9]{1,9}$' then (v_row ->> 'line')::int else v_index end;
      begin
        select id into v_grantor from public.members
        where assembly_id = p_assembly and external_ref = nullif(trim(v_row ->> 'grantor_ref'), '');
        if v_grantor is null then
          perform private.fail('grantor_not_found');
        end if;
        v_type := coalesce(nullif(v_row ->> 'type', ''), 'named');
        if v_type not in ('named', 'blank') then
          perform private.fail('invalid_proxy_type');
        end if;
        if v_type = 'named' then
          v_holder := case
            when nullif(trim(v_row ->> 'holder_ref'), '') is not null then jsonb_build_object('member_ref', v_row ->> 'holder_ref')
            when nullif(trim(v_row ->> 'holder_name'), '') is not null then
              jsonb_build_object('full_name', v_row ->> 'holder_name', 'email', v_row ->> 'holder_email')
            else null end;
          if v_holder is null then
            perform private.fail('missing_holder');
          end if;
          perform public.grant_proxy(p_assembly, v_grantor, private.resolve_proxy_holder(p_assembly, v_holder, true),
                                     'named');
        else
          perform public.grant_proxy(p_assembly, v_grantor, null, 'blank');
        end if;
        v_created := v_created + 1;
      exception when sqlstate 'P0001' then
        get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail;
        v_errors := v_errors || jsonb_build_object('line', v_line, 'code', v_message,
          'grantor_ref', v_row ->> 'grantor_ref', 'detail', case when v_detail ~ '^[\[{]' then v_detail::jsonb end);
      end;
    end loop;

    if jsonb_array_length(v_errors) > 0 or p_dry_run then
      -- Annule toutes les créations de l'import (sous-transaction), en conservant le rapport.
      -- Code propre au projet : P0002 est déjà utilisé par Postgres (no_data_found).
      raise exception using errcode = 'MB001', message = 'import_rolled_back';
    end if;
    perform private.audit(v_assembly.org_id, p_assembly, 'proxies.imported', jsonb_build_object(
      'rows', jsonb_array_length(p_rows), 'created', v_created, 'source', coalesce(p_source, '{}')));
  exception when sqlstate 'MB001' then
    v_created := case when jsonb_array_length(v_errors) = 0 then v_created else 0 end;
  end;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'dry_run', p_dry_run,
    'rows', jsonb_array_length(p_rows),
    'created', case when p_dry_run then 0 else v_created end,
    'valid', case when p_dry_run then v_created else null end,
    'error_count', jsonb_array_length(v_errors),
    'errors', v_errors);
end;
$$;

-- ===== Scans des pouvoirs signés =====
-- Chemin : {assembly_id}/{proxy_id}/{uuid}.{pdf|jpg|png}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proxy-documents', 'proxy-documents', false, 10 * 1024 * 1024,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy proxy_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'proxy-documents'
         and private.can_read_assembly(private.try_uuid((storage.foldername(name))[1])));
create policy proxy_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proxy-documents'
              and private.can_operate_assembly(private.try_uuid((storage.foldername(name))[1]))
              and exists (select 1 from public.proxies p
                          join public.assemblies a on a.id = p.assembly_id
                          where p.id = private.try_uuid((storage.foldername(name))[2])
                            and p.assembly_id = private.try_uuid((storage.foldername(name))[1])
                            and a.status in ('draft', 'convened', 'in_session')));
create policy proxy_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proxy-documents'
         and private.can_operate_assembly(private.try_uuid((storage.foldername(name))[1]))
         and not exists (select 1 from public.proxies p where p.document_path = name));

-- Tout chemin de document enregistré sur un pouvoir doit désigner un fichier déposé dans le
-- dossier de ce pouvoir (quel que soit le chemin d'écriture).
create function private.guard_proxy_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_path is not null and new.document_path is distinct from old.document_path then
    if split_part(new.document_path, '/', 1) <> new.assembly_id::text
       or split_part(new.document_path, '/', 2) <> new.id::text
       or not exists (select 1 from storage.objects where bucket_id = 'proxy-documents' and name = new.document_path) then
      raise exception using errcode = 'P0001', message = 'invalid_document';
    end if;
  end if;
  return new;
end;
$$;
create trigger proxies_guard_document before update of document_path on public.proxies
  for each row execute function private.guard_proxy_document();
create trigger proxies_guard_document_insert before insert on public.proxies
  for each row when (new.document_path is not null) execute function private.guard_proxy_document();

create function public.set_proxy_document(p_proxy uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proxy public.proxies;
  v_assembly public.assemblies;
begin
  select * into v_proxy from public.proxies where id = p_proxy;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_operation(v_proxy.assembly_id,
    array['draft', 'convened', 'in_session']::public.assembly_status[]);
  update public.proxies set document_path = p_path where id = p_proxy;
  perform private.audit(v_assembly.org_id, v_proxy.assembly_id, 'proxy.document_attached',
    jsonb_build_object('proxy_id', p_proxy, 'path', p_path));
end;
$$;

-- ===== Synthèse par mandataire =====
-- Pour chaque personne détenant au moins un pouvoir vivant : nombre de pouvoirs, voix détenues
-- sur la clé principale (propres + pouvoirs), part, conformité aux plafonds.
create function public.proxy_overview(p_assembly uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_primary uuid;
  v_total numeric;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_read_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  select id into v_primary from public.weight_keys where assembly_id = p_assembly and is_primary;
  select coalesce(sum(weight), 0) into v_total from public.member_weights where weight_key_id = v_primary;

  return jsonb_build_object(
    'rules', v_assembly.proxy_rules,
    'total_weight', v_total,
    'pending_blank', (select count(*) from public.proxies where assembly_id = p_assembly and status = 'pending'),
    'active', (select count(*) from public.proxies where assembly_id = p_assembly and status = 'active'),
    'holders', coalesce((
      with holders as (
        select a.id, a.full_name, a.status,
          (select count(*) from public.proxies p where p.holder_attendee_id = a.id and p.status = 'active') as proxy_count,
          (select coalesce(sum(mw.weight), 0) from public.member_weights mw
           where mw.weight_key_id = v_primary
             and mw.member_id in (select member_id from public.attendee_members where attendee_id = a.id)) as own_weight,
          (select coalesce(sum(mw.weight), 0) from public.member_weights mw
           join public.proxies p on p.grantor_member_id = mw.member_id
           where mw.weight_key_id = v_primary and p.holder_attendee_id = a.id and p.status = 'active') as proxy_weight
        from public.attendees a
        where a.assembly_id = p_assembly
          and exists (select 1 from public.proxies p where p.holder_attendee_id = a.id and p.status = 'active')
      ),
      checked as (
        select h.*, h.own_weight + h.proxy_weight as held,
          jsonb_typeof(v_assembly.proxy_rules -> 'max_count') = 'null'
            or h.proxy_count <= (v_assembly.proxy_rules ->> 'max_count')::int as count_ok,
          jsonb_typeof(v_assembly.proxy_rules -> 'max_share') = 'null'
            or (h.own_weight + h.proxy_weight) * (v_assembly.proxy_rules -> 'max_share' ->> 'den')::numeric
               <= (v_assembly.proxy_rules -> 'max_share' ->> 'num')::numeric * v_total as share_ok
        from holders h
      )
      select jsonb_agg(jsonb_build_object(
          'attendee_id', id, 'full_name', full_name, 'status', status, 'proxy_count', proxy_count,
          'own_weight', own_weight, 'proxy_weight', proxy_weight, 'held_weight', held,
          'count_ok', count_ok, 'share_ok', share_ok,
          'compliant', case when v_assembly.proxy_rules ->> 'combine' = 'or'
                              and jsonb_typeof(v_assembly.proxy_rules -> 'max_count') <> 'null'
                              and jsonb_typeof(v_assembly.proxy_rules -> 'max_share') <> 'null'
                            then count_ok or share_ok else count_ok and share_ok end)
        order by held desc, full_name)
      from checked), '[]'::jsonb));
end;
$$;

grant execute on function
  public.grant_proxy_to(uuid, uuid, jsonb, public.proxy_type, text),
  public.import_proxies(uuid, jsonb, boolean, jsonb),
  public.set_proxy_document(uuid, text),
  public.proxy_overview(uuid)
to authenticated;
