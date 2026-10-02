-- 0012 — Émargement (SPEC §5.5) : signatures manuscrites et instantané de l'écran d'accueil.

-- ===== Signatures (DECISIONS Q4 : image PNG + horodatage, sans prestataire) =====
-- Chemin : {assembly_id}/{attendee_id}/{uuid}.png. Jamais supprimées (pièce justificative).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1024 * 1024, array['image/png'])
on conflict (id) do nothing;

create policy signatures_read on storage.objects for select to authenticated
  using (bucket_id = 'signatures'
         and private.can_read_assembly(private.try_uuid((storage.foldername(name))[1])));
create policy signatures_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures'
              and private.can_operate_assembly(private.try_uuid((storage.foldername(name))[1]))
              and exists (select 1 from public.attendees t
                          join public.assemblies a on a.id = t.assembly_id
                          where t.id = private.try_uuid((storage.foldername(name))[2])
                            and t.assembly_id = private.try_uuid((storage.foldername(name))[1])
                            and a.status in ('convened', 'in_session')));

-- La signature d'une fiche doit être un fichier déposé dans le dossier de cette personne.
create function private.guard_attendee_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.signature_path is not null and new.signature_path is distinct from old.signature_path then
    if split_part(new.signature_path, '/', 1) <> new.assembly_id::text
       or split_part(new.signature_path, '/', 2) <> new.id::text
       or not exists (select 1 from storage.objects where bucket_id = 'signatures' and name = new.signature_path) then
      raise exception using errcode = 'P0001', message = 'invalid_signature';
    end if;
  end if;
  return new;
end;
$$;
create trigger attendees_guard_signature before update of signature_path on public.attendees
  for each row execute function private.guard_attendee_signature();

-- ===== Instantané de l'accueil =====
-- Tout ce qu'affiche l'écran d'accueil, en une lecture cohérente : membres (avec leur porteur,
-- leur pouvoir vivant et leur présence), personnes (avec leurs membres, pouvoirs détenus et
-- appareil de vote), quorum.
create function public.reception_snapshot(p_assembly uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_primary uuid;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_operate_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  select id into v_primary from public.weight_keys where assembly_id = p_assembly and is_primary;

  return jsonb_build_object(
    'assembly', jsonb_build_object('id', v_assembly.id, 'title', v_assembly.title, 'status', v_assembly.status,
      'president_attendee_id', v_assembly.president_attendee_id, 'proxy_rules', v_assembly.proxy_rules),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'ref', m.external_ref, 'name', m.display_name, 'kind', m.kind,
          'representative', m.representative_name, 'ineligible', m.is_proxy_ineligible,
          'weight', coalesce(mw.weight, 0),
          'presence', coalesce(mp.status, 'expected'), 'holder_attendee_id', mp.holder_attendee_id,
          'attendee_id', am.attendee_id,
          'proxy', case when p.id is not null then jsonb_build_object(
            'id', p.id, 'type', p.type, 'status', p.status, 'holder_attendee_id', p.holder_attendee_id) end)
        order by m.external_ref nulls last, m.display_name)
      from public.members m
      left join public.member_weights mw on mw.member_id = m.id and mw.weight_key_id = v_primary
      left join public.member_presence mp on mp.member_id = m.id
      left join public.attendee_members am on am.member_id = m.id
      left join public.proxies p on p.grantor_member_id = m.id and p.status in ('active', 'pending')
      where m.assembly_id = p_assembly), '[]'::jsonb),
    'attendees', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', a.id, 'full_name', a.full_name, 'email', a.email, 'status', a.status, 'version', a.version,
          'checked_in_at', a.checked_in_at, 'checked_out_at', a.checked_out_at,
          'has_signature', a.signature_path is not null, 'ineligible', a.is_proxy_ineligible,
          'member_ids', coalesce((select jsonb_agg(member_id) from public.attendee_members where attendee_id = a.id), '[]'::jsonb),
          'proxy_member_ids', coalesce((select jsonb_agg(grantor_member_id) from public.proxies
                                        where holder_attendee_id = a.id and status = 'active'), '[]'::jsonb),
          'device', (select jsonb_build_object('kind', t.kind, 'label', t.device_label, 'claimed', t.claimed_by is not null)
                     from public.voter_tokens t where t.attendee_id = a.id and t.revoked_at is null
                       and t.expires_at > now()))
        order by a.full_name)
      from public.attendees a
      where a.assembly_id = p_assembly), '[]'::jsonb),
    'quorum', public.current_quorum(p_assembly),
    'at', statement_timestamp());
end;
$$;

grant execute on function public.reception_snapshot(uuid) to authenticated;
