-- 0017 — Exports (SPEC §5.10) : feuille de présence (PDF, XLSX, avec signatures) et résultats
-- (PDF, XLSX, CSV).
--
-- Les documents sont produits côté serveur (route Node) à partir de deux lectures cohérentes
-- fournies par la base, puis déposés dans un bucket privé et enregistrés avec leur empreinte
-- SHA-256 (journal en ajout seul, audit). Réservé à la préparation et au bureau.

create function private.can_export(p_assembly uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_assembly(p_assembly) or private.is_bureau(p_assembly);
$$;
grant execute on function private.can_export(uuid) to authenticated, service_role;

-- ===== Journal des exports =====
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  kind text not null check (kind in ('attendance', 'results')),
  format text not null check (format in ('pdf', 'xlsx', 'csv')),
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  assembly_status public.assembly_status not null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index exports_assembly_idx on public.exports (assembly_id, created_at desc);
create trigger exports_no_update_delete before update or delete on public.exports
  for each row execute function private.forbid_mutation();

alter table public.exports enable row level security;
alter table public.exports force row level security;
create policy exports_select on public.exports for select to authenticated
  using (private.can_export(assembly_id));
grant select on public.exports to authenticated, service_role;

-- ===== Stockage =====
-- Chemin : {assembly_id}/{uuid}.{pdf|xlsx|csv}. Jamais supprimé (pièce justificative).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 50 * 1024 * 1024,
        array['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy exports_read on storage.objects for select to authenticated
  using (bucket_id = 'exports' and private.can_export(private.try_uuid((storage.foldername(name))[1])));
create policy exports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exports' and private.can_export(private.try_uuid((storage.foldername(name))[1])));

-- ===== Données de la feuille de présence =====
create function public.export_attendance_data(p_assembly uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_export(p_assembly) then
    perform private.fail('not_found');
  end if;

  return jsonb_build_object(
    'assembly', jsonb_build_object('id', v_assembly.id, 'title', v_assembly.title, 'type', v_assembly.type,
      'status', v_assembly.status, 'starts_at', v_assembly.starts_at, 'timezone', v_assembly.timezone,
      'location', v_assembly.location,
      'organization', (select name from public.organizations where id = v_assembly.org_id)),
    'keys', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'label', label, 'is_primary', is_primary)
                                       order by position)
                      from public.weight_keys where assembly_id = p_assembly), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'ref', m.external_ref, 'name', m.display_name, 'kind', m.kind, 'representative', m.representative_name,
          'weights', coalesce((select jsonb_object_agg(k.code, mw.weight) from public.member_weights mw
                               join public.weight_keys k on k.id = mw.weight_key_id where mw.member_id = m.id),
                              '{}'::jsonb),
          'presence', coalesce(mp.status, 'expected'),
          'holder', h.full_name,
          'proxy_type', p.type,
          'attendee', case when a.id is not null then jsonb_build_object(
            'name', a.full_name, 'status', a.status, 'checked_in_at', a.checked_in_at,
            'checked_out_at', a.checked_out_at, 'signature_path', a.signature_path) end)
        order by m.external_ref nulls last, m.display_name)
      from public.members m
      left join public.member_presence mp on mp.member_id = m.id
      left join public.attendees h on h.id = mp.holder_attendee_id
      left join public.proxies p on p.id = mp.via_proxy_id
      left join public.attendee_members am on am.member_id = m.id
      left join public.attendees a on a.id = am.attendee_id
      where m.assembly_id = p_assembly), '[]'::jsonb),
    -- Personnes sans membre en propre (mandataires tiers, invités) ayant émargé.
    'others', coalesce((
      select jsonb_agg(jsonb_build_object(
          'name', a.full_name, 'status', a.status, 'checked_in_at', a.checked_in_at,
          'checked_out_at', a.checked_out_at, 'signature_path', a.signature_path,
          'proxies', (select count(*) from public.proxies where holder_attendee_id = a.id and status = 'active'))
        order by a.full_name)
      from public.attendees a
      where a.assembly_id = p_assembly and a.checked_in_at is not null
        and not exists (select 1 from public.attendee_members am where am.attendee_id = a.id)), '[]'::jsonb),
    'quorum', coalesce((select jsonb_agg(public.current_quorum(p_assembly, k.id) order by k.position)
                        from public.weight_keys k where k.assembly_id = p_assembly), '[]'::jsonb),
    'bureau', coalesce((
      select jsonb_agg(jsonb_build_object('role', s.role, 'name', coalesce(pr.full_name, pr.email::text))
                       order by s.role, pr.email)
      from public.assembly_staff s left join public.profiles pr on pr.id = s.user_id
      where s.assembly_id = p_assembly and s.role in ('president', 'secretary', 'scrutineer')), '[]'::jsonb),
    'generated_at', statement_timestamp());
end;
$$;

-- ===== Données des résultats =====
create function public.export_results_data(p_assembly uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_export(p_assembly) then
    perform private.fail('not_found');
  end if;

  return jsonb_build_object(
    'assembly', jsonb_build_object('id', v_assembly.id, 'title', v_assembly.title, 'type', v_assembly.type,
      'status', v_assembly.status, 'starts_at', v_assembly.starts_at, 'timezone', v_assembly.timezone,
      'location', v_assembly.location,
      'organization', (select name from public.organizations where id = v_assembly.org_id)),
    'resolutions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'number', r.number, 'title', r.title, 'vote_type', r.vote_type, 'weight_key', k.label,
          'majority_rule', r.majority_rule, 'abstention_policy', r.abstention_policy, 'is_secret', r.is_secret,
          'ballots', coalesce((
            select jsonb_agg(jsonb_build_object(
                'round', b.round, 'status', b.status, 'opened_at', b.opened_at, 'closed_at', b.closed_at,
                'validated_at', b.validated_at, 'cancelled_reason', b.cancelled_reason,
                'quorum', b.totals -> 'quorum', 'quorum_rule', b.rules_snapshot -> 'quorum',
                'outcome', res.outcome, 'tallies', res.tallies,
                'majority', res.evaluation -> 'majority',
                'votes_digest', encode(b.votes_digest, 'hex'))
              order by b.round)
            from public.ballots b left join public.results res on res.ballot_id = b.id
            where b.resolution_id = r.id and b.status <> 'open'), '[]'::jsonb))
        order by coalesce(par.position, r.position), r.parent_id nulls first, r.position)
      from public.resolutions r
      join public.weight_keys k on k.id = r.weight_key_id
      left join public.resolutions par on par.id = r.parent_id
      where r.assembly_id = p_assembly), '[]'::jsonb),
    'generated_at', statement_timestamp());
end;
$$;

-- ===== Enregistrement d'un export déposé =====
create function public.record_export(p_assembly uuid, p_kind text, p_format text, p_path text, p_sha256 text,
                                     p_size bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_id uuid;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_export(p_assembly) then
    perform private.fail('not_found');
  end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_assembly::text
     or not exists (select 1 from storage.objects where bucket_id = 'exports' and name = p_path) then
    perform private.fail('invalid_document');
  end if;
  insert into public.exports (assembly_id, kind, format, path, sha256, size_bytes, assembly_status, created_by)
  values (p_assembly, p_kind, p_format, p_path, lower(p_sha256), p_size, v_assembly.status, auth.uid())
  returning id into v_id;
  perform private.audit(v_assembly.org_id, p_assembly, 'export.generated', jsonb_build_object(
    'export_id', v_id, 'kind', p_kind, 'format', p_format, 'sha256', lower(p_sha256), 'size_bytes', p_size));
  return v_id;
end;
$$;

grant execute on function
  public.export_attendance_data(uuid),
  public.export_results_data(uuid),
  public.record_export(uuid, text, text, text, text, bigint)
to authenticated;
