-- 0015 — Pilotage de séance (SPEC §5.7) et verrouillages (SPEC §5.9).
--
-- Verrous : dès l'ouverture de la séance, poids, clés de répartition, membres et résolutions
-- ne sont plus modifiables par la préparation (les RPC le refusaient déjà ; les déclencheurs
-- ci-dessous sont la seconde barrière, valable pour tout chemin d'écriture). Seul le bureau peut
-- corriger, en séance, avec un motif tracé : le poids d'un membre, ou une résolution qui n'a pas
-- encore été mise au vote. Une fois l'AG close : lecture seule, sans exception.

-- ===== Verrous de séance =====
create function private.bureau_override_active()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('mobag.bureau_override', true), '') = 'on';
$$;

create function private.guard_session_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_status public.assembly_status;
begin
  select status into v_status from public.assemblies where id = (v_row ->> 'assembly_id')::uuid;
  if v_status in ('closed', 'archived')
     or (v_status = 'in_session' and not private.bureau_override_active()) then
    raise exception using errcode = 'P0001', message = 'assembly_locked',
      detail = jsonb_build_object('status', v_status, 'table', tg_table_name)::text;
  end if;
  -- Une résolution déjà mise au vote ne change plus, même par le bureau (la renumérotation
  -- technique de l'ordre du jour, qui ne touche que la position, reste possible).
  if tg_table_name = 'resolutions' and tg_op <> 'INSERT'
     and (tg_op = 'DELETE' or to_jsonb(new) - 'position' <> to_jsonb(old) - 'position') and exists (
       select 1 from public.ballots where resolution_id = (v_row ->> 'id')::uuid and status <> 'cancelled') then
    raise exception using errcode = 'P0001', message = 'resolution_voted';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger members_session_lock before insert or update or delete on public.members
  for each row execute function private.guard_session_lock();
create trigger member_weights_session_lock before insert or update or delete on public.member_weights
  for each row execute function private.guard_session_lock();
create trigger weight_keys_session_lock before insert or update or delete on public.weight_keys
  for each row execute function private.guard_session_lock();
create trigger resolutions_session_lock before insert or update or delete on public.resolutions
  for each row execute function private.guard_session_lock();

-- Préparation : brouillon ou convoquée. En séance, uniquement sous correction du bureau.
create or replace function private.lock_assembly_for_edit(p_assembly uuid)
returns public.assemblies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if private.bureau_override_active() then
    if not found or not private.is_bureau(p_assembly) then
      perform private.fail('not_found');
    end if;
    if v_assembly.status <> 'in_session' then
      perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
    end if;
    return v_assembly;
  end if;
  if not found or not private.can_manage_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  if v_assembly.status not in ('draft', 'convened') then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  return v_assembly;
end;
$$;

-- ===== Corrections du bureau en séance =====

-- Résolution pas encore mise au vote (coquille, amendement adopté en séance). Mêmes contrôles et
-- même historique que la préparation ; le motif est obligatoire.
create function public.bureau_amend_resolution(p_resolution uuid, p_data jsonb, p_expected_version int,
                                               p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.resolutions;
  v_assembly public.assemblies;
begin
  select * into v_resolution from public.resolutions where id = p_resolution;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_resolution.assembly_id);
  select * into v_assembly from public.assemblies where id = v_resolution.assembly_id;
  if v_assembly.status <> 'in_session' then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    perform private.fail('bureau_reason_required');
  end if;
  if exists (select 1 from public.ballots where resolution_id = p_resolution and status <> 'cancelled') then
    perform private.fail('resolution_voted');
  end if;
  if p_data ? 'parent_id' and private.try_uuid(p_data ->> 'parent_id') is distinct from v_resolution.parent_id then
    perform private.fail('invalid_parent');   -- pas de réorganisation de l'ordre du jour en séance
  end if;

  perform set_config('mobag.bureau_override', 'on', true);
  perform public.upsert_resolution(v_resolution.assembly_id, p_resolution,
    p_data || jsonb_build_object('parent_id', v_resolution.parent_id), p_expected_version, p_reason);
  perform set_config('mobag.bureau_override', '', true);

  perform private.audit(v_assembly.org_id, v_assembly.id, 'bureau.resolution_amended', jsonb_build_object(
    'resolution_id', p_resolution, 'reason', trim(p_reason)));
  return p_resolution;
end;
$$;

-- Poids d'un membre sur une clé. Sans effet sur un scrutin ouvert (base figée) ; le quorum
-- affiché en tient compte immédiatement.
create function public.bureau_set_member_weight(p_member uuid, p_weight_key uuid, p_weight numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_assembly public.assemblies;
  v_before numeric;
begin
  select * into v_member from public.members where id = p_member;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_member.assembly_id);
  select * into v_assembly from public.assemblies where id = v_member.assembly_id for update;
  if v_assembly.status <> 'in_session' then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    perform private.fail('bureau_reason_required');
  end if;
  if p_weight is null or p_weight < 0 or p_weight >= 1e18 then
    perform private.fail('invalid_weight');
  end if;
  if not exists (select 1 from public.weight_keys where id = p_weight_key and assembly_id = v_member.assembly_id) then
    perform private.fail('invalid_weight_key');
  end if;
  select weight into v_before from public.member_weights where member_id = p_member and weight_key_id = p_weight_key;

  perform private.lock_presence(v_member.assembly_id);
  perform set_config('mobag.bureau_override', 'on', true);
  insert into public.member_weights (member_id, weight_key_id, assembly_id, weight)
  values (p_member, p_weight_key, v_member.assembly_id, p_weight)
  on conflict (member_id, weight_key_id) do update set weight = excluded.weight;
  perform set_config('mobag.bureau_override', '', true);

  perform private.audit(v_assembly.org_id, v_assembly.id, 'bureau.weight_corrected', jsonb_build_object(
    'member_id', p_member, 'weight_key_id', p_weight_key, 'from', v_before, 'to', p_weight, 'reason', trim(p_reason)));
  perform private.notify(v_assembly.id, 'presence', 'staff');
end;
$$;

-- ===== Scrutin en cours : minuteur et relance =====

-- Pose, change ou retire (null) le minuteur d'un scrutin ouvert.
create function public.set_ballot_timer(p_ballot uuid, p_seconds int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_closes timestamptz;
  v_org uuid;
begin
  select * into v_ballot from public.ballots where id = p_ballot for update;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_ballot.assembly_id);
  if v_ballot.status <> 'open' or (v_ballot.closes_at is not null and v_ballot.closes_at <= clock_timestamp()) then
    perform private.fail('ballot_not_open');
  end if;
  if p_seconds is not null and p_seconds not between 10 and 86400 then
    perform private.fail('invalid_duration');
  end if;
  v_closes := case when p_seconds is not null then clock_timestamp() + make_interval(secs => p_seconds) end;
  update public.ballots set closes_at = v_closes where id = p_ballot;
  select org_id into v_org from public.assemblies where id = v_ballot.assembly_id;
  perform private.audit(v_org, v_ballot.assembly_id, 'ballot.timer_set', jsonb_build_object(
    'ballot_id', p_ballot, 'closes_at', v_closes));
  return v_closes;
end;
$$;

-- Relance des appareils qui n'ont pas encore voté (l'écran du votant l'affiche s'il lui reste
-- des voix à exprimer).
create function public.remind_voters(p_ballot uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_pending int;
  v_org uuid;
begin
  select * into v_ballot from public.ballots where id = p_ballot;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_ballot.assembly_id);
  if v_ballot.status <> 'open' then
    perform private.fail('ballot_not_open');
  end if;
  select count(distinct e.holder_attendee_id) into v_pending
  from public.ballot_eligibility e
  where e.ballot_id = p_ballot and e.holder_attendee_id is not null
    and not exists (select 1 from public.votes v where v.ballot_id = p_ballot and v.member_id = e.member_id);
  select org_id into v_org from public.assemblies where id = v_ballot.assembly_id;
  perform private.audit(v_org, v_ballot.assembly_id, 'ballot.reminder', jsonb_build_object(
    'ballot_id', p_ballot, 'pending_attendees', v_pending));
  perform private.notify(v_ballot.assembly_id, 'reminder', 'voters');
  return v_pending;
end;
$$;

-- ===== Instantané de la régie =====
-- Tout ce qu'affiche la régie en une lecture : AG, quorum par clé, appareils, ordre du jour avec
-- l'historique des scrutins de chaque résolution (résultats seulement une fois clos), scrutin
-- ouvert et sa participation (sans tendance).
create function public.regie_snapshot(p_assembly uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_open uuid;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_read_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  select id into v_open from public.ballots where assembly_id = p_assembly and status = 'open'
  order by opened_at desc limit 1;

  return jsonb_build_object(
    'assembly', jsonb_build_object('id', v_assembly.id, 'org_id', v_assembly.org_id, 'title', v_assembly.title,
      'status', v_assembly.status, 'settings', v_assembly.settings, 'quorum_rule', v_assembly.quorum_rule,
      'president_attendee_id', v_assembly.president_attendee_id),
    'quorum', coalesce((select jsonb_agg(public.current_quorum(p_assembly, k.id) order by k.position)
                        from public.weight_keys k where k.assembly_id = p_assembly), '[]'::jsonb),
    'devices', jsonb_build_object(
      'present', (select count(*) from public.attendees where assembly_id = p_assembly and status = 'present'),
      'issued', (select count(*) from public.voter_tokens where assembly_id = p_assembly and revoked_at is null
                   and expires_at > statement_timestamp()),
      'associated', (select count(*) from public.voter_tokens where assembly_id = p_assembly and revoked_at is null
                       and claimed_by is not null and expires_at > statement_timestamp())),
    'resolutions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id, 'number', r.number, 'title', r.title, 'parent_id', r.parent_id, 'vote_type', r.vote_type,
          'mode', r.mode, 'weight_key', k.label, 'majority_rule', r.majority_rule,
          'abstention_policy', r.abstention_policy, 'quorum_rule', r.quorum_rule, 'is_secret', r.is_secret,
          'board_recommendation', r.board_recommendation, 'version', r.version,
          'ballots', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', b.id, 'round', b.round, 'status', b.status, 'opened_at', b.opened_at,
                'closes_at', b.closes_at, 'closed_at', b.closed_at, 'validated_at', b.validated_at,
                'cancelled_reason', b.cancelled_reason, 'totals', b.totals,
                'outcome', case when b.status <> 'open' then res.outcome end,
                'tallies', case when b.status <> 'open' then res.tallies end,
                'evaluation', case when b.status <> 'open' then res.evaluation end)
              order by b.round)
            from public.ballots b left join public.results res on res.ballot_id = b.id
            where b.resolution_id = r.id), '[]'::jsonb))
        order by coalesce(p.position, r.position), r.parent_id nulls first, r.position)
      from public.resolutions r
      join public.weight_keys k on k.id = r.weight_key_id
      left join public.resolutions p on p.id = r.parent_id
      where r.assembly_id = p_assembly), '[]'::jsonb),
    'open_ballot', case when v_open is not null then public.ballot_progress(v_open) end,
    'at', statement_timestamp());
end;
$$;

-- ===== Terminaux connectés (Realtime Presence) =====
-- Les appareils votants signalent leur présence sur le canal des votants ; la régie (personnel
-- de l'AG) écoute ce canal pour les compter.
create or replace function private.can_receive_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(p_topic, ':', 1) = 'assembly'
     and case split_part(p_topic, ':', 3)
           when 'staff' then private.can_read_assembly(private.try_uuid(split_part(p_topic, ':', 2)))
           when 'voters' then private.current_attendee_id(private.try_uuid(split_part(p_topic, ':', 2))) is not null
                           or private.can_read_assembly(private.try_uuid(split_part(p_topic, ':', 2)))
           else false
         end;
$$;

create function private.can_track_presence(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(p_topic, ':', 1) = 'assembly' and split_part(p_topic, ':', 3) = 'voters'
     and private.current_attendee_id(private.try_uuid(split_part(p_topic, ':', 2))) is not null;
$$;
grant execute on function private.can_track_presence(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy mobag_receive_assembly_signals on realtime.messages';
    execute $p$
      create policy mobag_receive_assembly_signals on realtime.messages for select to authenticated
        using (realtime.messages.extension in ('broadcast', 'presence') and private.can_receive_topic(realtime.topic()))
    $p$;
    execute $p$
      create policy mobag_track_voter_presence on realtime.messages for insert to authenticated
        with check (realtime.messages.extension = 'presence' and private.can_track_presence(realtime.topic()))
    $p$;
  end if;
end;
$$;

grant execute on function
  public.bureau_amend_resolution(uuid, jsonb, int, text),
  public.bureau_set_member_weight(uuid, uuid, numeric, text),
  public.set_ballot_timer(uuid, int),
  public.remind_voters(uuid),
  public.regie_snapshot(uuid)
to authenticated;
