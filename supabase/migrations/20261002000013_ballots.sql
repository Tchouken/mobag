-- 0013 — Moteur de scrutin (SPEC §5.7, §5.8, §7.3).
--
-- Ouverture : l'état de présence est FIGÉ dans ballot_eligibility (qui porte quelles voix, avec
-- quel poids sur la clé de la résolution) avec les bases du calcul (tous les membres, présents et
-- représentés) et l'évaluation du quorum. Les retardataires ne votent pas sur un scrutin déjà
-- ouvert ; un départ pendant le scrutin transmet les voix non encore exprimées (5.6.4) ou les
-- laisse sans porteur (présent non votant, DECISIONS B2).
--
-- Vote : chemin chaud, sans chaîne d'audit par vote. Idempotent (clé fournie par l'appareil),
-- tout ou rien pour un lot de membres, exclusion d'une clôture concurrente par un verrou
-- consultatif partagé (la clôture le prend en exclusif). Chaque écriture laisse une trace en
-- ajout seul (vote_events) ; la clôture scelle l'ensemble par une empreinte SHA-256 inscrite
-- dans la chaîne d'audit.
--
-- Vote secret (DECISIONS Q5, modèle §7.3) : le vote reste rattaché au membre (unicité, droit de
-- modification, contrôle) mais n'est lisible par aucun rôle applicatif ; seuls les résultats
-- agrégés sont publiés.

create extension if not exists pg_cron;

-- ===== Tables =====
create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  resolution_id uuid not null,
  round int not null default 1 check (round > 0),
  status public.ballot_status not null default 'open',
  rules_snapshot jsonb not null,             -- majorité, abstentions, quorum, clé, secret, modification
  totals jsonb not null default '{}',        -- bases figées et quorum évalué à l'ouverture
  opened_at timestamptz not null default clock_timestamp(),
  opened_by uuid,
  closes_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  votes_digest bytea,
  validated_at timestamptz,
  validated_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,
  unique (id, assembly_id),
  foreign key (resolution_id, assembly_id) references public.resolutions (id, assembly_id),
  check ((status in ('closed', 'validated')) = (closed_at is not null and votes_digest is not null)
         or (status = 'cancelled')),
  check ((status = 'validated') = (validated_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
-- Un seul scrutin vivant par résolution (un scrutin annulé peut être repris).
create unique index ballots_one_live_per_resolution on public.ballots (resolution_id) where status <> 'cancelled';
create index ballots_assembly_idx on public.ballots (assembly_id, status);

create table public.ballot_eligibility (
  ballot_id uuid not null,
  member_id uuid not null,
  assembly_id uuid not null,
  weight numeric(24, 6) not null check (weight > 0),
  presence_status public.presence_status not null,
  holder_attendee_id uuid,                   -- null : voix sans porteur (parti) ou vote automatique
  via_proxy_id uuid,
  auto_choice text check (auto_choice in ('for', 'against')),   -- pouvoir en blanc, avis du conseil (B7)
  holder_changed_at timestamptz,
  primary key (ballot_id, member_id),
  foreign key (ballot_id, assembly_id) references public.ballots (id, assembly_id) on delete cascade,
  foreign key (member_id, assembly_id) references public.members (id, assembly_id),
  foreign key (holder_attendee_id, assembly_id) references public.attendees (id, assembly_id)
);
create index ballot_eligibility_holder_idx on public.ballot_eligibility (ballot_id, holder_attendee_id);
create index ballot_eligibility_member_idx on public.ballot_eligibility (member_id);

create table public.votes (
  id bigint generated always as identity primary key,
  ballot_id uuid not null,
  member_id uuid not null,
  assembly_id uuid not null,
  choice text not null check (choice in ('for', 'against', 'abstain')),
  weight numeric(24, 6) not null,
  cast_by_attendee_id uuid,
  cast_by_user_id uuid,
  channel public.cast_channel not null,
  idempotency_key uuid,
  revision int not null default 1,
  cast_at timestamptz not null default clock_timestamp(),
  unique (ballot_id, member_id),             -- SPEC §5.9 : un seul vote par membre et par scrutin
  foreign key (ballot_id, member_id) references public.ballot_eligibility (ballot_id, member_id) on delete cascade
);

-- Historique en ajout seul de chaque vote et modification ; scellé à la clôture.
create table public.vote_events (
  id bigint generated always as identity primary key,
  ballot_id uuid not null,
  member_id uuid not null,
  choice text not null,
  weight numeric(24, 6) not null,
  revision int not null,
  cast_by_attendee_id uuid,
  cast_by_user_id uuid,
  channel public.cast_channel not null,
  idempotency_key uuid,
  at timestamptz not null
);
create index vote_events_ballot_idx on public.vote_events (ballot_id, id);
create trigger vote_events_no_update_delete before update or delete on public.vote_events
  for each row execute function private.forbid_mutation();
create trigger vote_events_no_truncate before truncate on public.vote_events
  for each statement execute function private.forbid_mutation();

-- Idempotence des envois (réessais réseau) et limitation de débit par appareil.
create table public.vote_requests (
  idempotency_key uuid primary key,
  ballot_id uuid not null,
  attendee_id uuid not null,
  response jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index vote_requests_attendee_idx on public.vote_requests (attendee_id, created_at);

create table public.results (
  ballot_id uuid primary key,
  assembly_id uuid not null,
  tallies jsonb not null,
  evaluation jsonb not null,
  outcome public.ballot_outcome not null,
  computed_at timestamptz not null default clock_timestamp(),
  foreign key (ballot_id, assembly_id) references public.ballots (id, assembly_id) on delete cascade
);

alter table public.ballots enable row level security;
alter table public.ballots force row level security;
alter table public.ballot_eligibility enable row level security;
alter table public.ballot_eligibility force row level security;
alter table public.votes enable row level security;
alter table public.votes force row level security;
alter table public.vote_events enable row level security;
alter table public.vote_events force row level security;
alter table public.vote_requests enable row level security;
alter table public.vote_requests force row level security;
alter table public.results enable row level security;
alter table public.results force row level security;

-- Personnel : scrutins, bases figées et résultats. Les votes individuels : personne.
create policy ballots_select on public.ballots for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy ballot_eligibility_select on public.ballot_eligibility for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy results_select on public.results for select to authenticated
  using (private.can_read_assembly(assembly_id));
grant select on public.ballots, public.ballot_eligibility, public.results to authenticated, service_role;

-- ===== Helpers =====

create function private.ballot_lock_key(p_ballot uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended('ballot:' || p_ballot::text, 0);
$$;

-- Bureau de séance (le super-admin en fait partie).
create function private.require_bureau(p_assembly uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_bureau(p_assembly) then
    if private.can_read_assembly(p_assembly) then
      perform private.fail('forbidden');
    end if;
    perform private.fail('not_found');
  end if;
end;
$$;

-- Empreinte des votes d'un scrutin : SHA-256 des événements dans l'ordre d'écriture.
create function private.ballot_votes_digest(p_ballot uuid)
returns bytea
language sql
stable
set search_path = ''
as $$
  select extensions.digest(coalesce(string_agg(concat_ws('|', e.id, e.member_id, e.choice, e.weight::text, e.revision,
           e.channel, coalesce(e.cast_by_attendee_id::text, ''), coalesce(e.cast_by_user_id::text, ''),
           to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), E'\n' order by e.id), ''), 'sha256')
  from public.vote_events e
  where e.ballot_id = p_ballot;
$$;

-- Calcule (ou recalcule) le résultat d'un scrutin à partir des votes et des bases figées.
--   expressed : pour + contre (+ abstentions si la résolution les compte)
-- Le quorum, évalué à l'ouverture, prime : s'il n'est pas atteint, le résultat est « no_quorum ».
create function private.compute_result(p_ballot uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_tallies jsonb;
  v_values jsonb;
  v_majority jsonb;
  v_outcome public.ballot_outcome;
  v_quorum_reached boolean;
begin
  select * into strict v_ballot from public.ballots where id = p_ballot;

  with t as (
    select
      coalesce(sum(weight) filter (where choice = 'for'), 0) as for_w, count(*) filter (where choice = 'for') as for_h,
      coalesce(sum(weight) filter (where choice = 'against'), 0) as against_w,
      count(*) filter (where choice = 'against') as against_h,
      coalesce(sum(weight) filter (where choice = 'abstain'), 0) as abstain_w,
      count(*) filter (where choice = 'abstain') as abstain_h,
      coalesce(sum(weight), 0) as voted_w, count(*) as voted_h
    from public.votes where ballot_id = p_ballot
  )
  select jsonb_build_object(
    'for', jsonb_build_object('weight', for_w, 'heads', for_h),
    'against', jsonb_build_object('weight', against_w, 'heads', against_h),
    'abstain', jsonb_build_object('weight', abstain_w, 'heads', abstain_h),
    'expressed', case when v_ballot.rules_snapshot ->> 'abstention' = 'included'
      then jsonb_build_object('weight', for_w + against_w + abstain_w, 'heads', for_h + against_h + abstain_h)
      else jsonb_build_object('weight', for_w + against_w, 'heads', for_h + against_h) end,
    'voted', jsonb_build_object('weight', voted_w, 'heads', voted_h),
    'not_voted', jsonb_build_object(
      'weight', (v_ballot.totals -> 'present_represented' ->> 'weight')::numeric - voted_w,
      'heads', (v_ballot.totals -> 'present_represented' ->> 'heads')::bigint - voted_h),
    'present_represented', v_ballot.totals -> 'present_represented',
    'all_members', v_ballot.totals -> 'all_members')
  into v_tallies
  from t;

  v_values := v_tallies;
  v_majority := private.evaluate_rule(v_ballot.rules_snapshot -> 'majority', v_values);
  v_quorum_reached := coalesce((v_ballot.totals -> 'quorum' ->> 'reached')::boolean, true);
  v_outcome := case when not v_quorum_reached then 'no_quorum'::public.ballot_outcome
                    when (v_majority ->> 'reached')::boolean then 'adopted'::public.ballot_outcome
                    else 'rejected'::public.ballot_outcome end;

  insert into public.results (ballot_id, assembly_id, tallies, evaluation, outcome)
  values (p_ballot, v_ballot.assembly_id, v_tallies,
          jsonb_build_object('quorum', v_ballot.totals -> 'quorum', 'majority', v_majority), v_outcome)
  on conflict (ballot_id) do update set tallies = excluded.tallies, evaluation = excluded.evaluation,
    outcome = excluded.outcome, computed_at = clock_timestamp();

  return jsonb_build_object('outcome', v_outcome, 'tallies', v_tallies,
    'evaluation', jsonb_build_object('quorum', v_ballot.totals -> 'quorum', 'majority', v_majority));
end;
$$;

-- Clôture effective (droits vérifiés par l'appelant). Attend la fin des votes en cours.
create function private.close_ballot_internal(p_ballot uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_digest bytea;
  v_result jsonb;
  v_org uuid;
begin
  perform pg_advisory_xact_lock(private.ballot_lock_key(p_ballot));
  select * into v_ballot from public.ballots where id = p_ballot for update;
  if v_ballot.status <> 'open' then
    perform private.fail('ballot_not_open');
  end if;
  v_digest := private.ballot_votes_digest(p_ballot);
  update public.ballots set status = 'closed', closed_at = clock_timestamp(), closed_by = auth.uid(),
    votes_digest = v_digest
  where id = p_ballot;
  v_result := private.compute_result(p_ballot);

  select org_id into v_org from public.assemblies where id = v_ballot.assembly_id;
  perform private.audit(v_org, v_ballot.assembly_id, 'ballot.closed', jsonb_build_object(
    'ballot_id', p_ballot, 'resolution_id', v_ballot.resolution_id, 'round', v_ballot.round,
    'votes_digest', encode(v_digest, 'hex'),
    'votes', (select count(*) from public.vote_events where ballot_id = p_ballot),
    'expired', v_ballot.closes_at is not null and clock_timestamp() >= v_ballot.closes_at,
    'result', v_result));
  return v_result;
end;
$$;

-- ===== Règle 5.6.4 : mouvements de présence pendant un scrutin ouvert =====
-- Remplace le point d'extension de T6. Pour les membres touchés qui n'ont pas encore voté :
--   transfer_unvoted : les voix suivent le nouveau porteur (aucun s'il est parti : le membre
--                      reste dans la base figée, présent non votant — DECISIONS B2) ;
--   freeze           : rien ne change (le porteur de l'ouverture garde le droit de vote).
-- Un membre absent de la base figée (arrivé après l'ouverture) n'est jamais ajouté.
create or replace function private.after_presence_change(p_assembly uuid, p_changes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_changes is null or jsonb_array_length(p_changes) = 0 then
    return;
  end if;
  if coalesce((select settings ->> 'departure_during_ballot' from public.assemblies where id = p_assembly),
              'transfer_unvoted') <> 'transfer_unvoted' then
    return;
  end if;

  update public.ballot_eligibility e
  set holder_attendee_id = (c ->> 'holder_to')::uuid, holder_changed_at = clock_timestamp()
  from jsonb_array_elements(p_changes) c, public.ballots b
  where b.assembly_id = p_assembly and b.status = 'open'
    and e.ballot_id = b.id
    and e.member_id = (c ->> 'member_id')::uuid
    and e.auto_choice is null
    and e.holder_attendee_id is distinct from (c ->> 'holder_to')::uuid
    and not exists (select 1 from public.votes v where v.ballot_id = b.id and v.member_id = e.member_id);
end;
$$;

-- ===== RPC : bureau =====

-- Ouvre le scrutin d'une résolution. p_duration_seconds : minuteur facultatif.
create function public.open_ballot(p_resolution uuid, p_duration_seconds int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.resolutions;
  v_assembly public.assemblies;
  v_ballot uuid;
  v_round int;
  v_quorum_rule jsonb;
  v_totals jsonb;
  v_counts jsonb;
  v_blank_auto boolean;
  v_auto int;
begin
  select * into v_resolution from public.resolutions where id = p_resolution;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_resolution.assembly_id);
  -- Instantané cohérent avec les mouvements de l'accueil.
  v_assembly := private.lock_assembly_for_operation(v_resolution.assembly_id,
    array['in_session']::public.assembly_status[]);

  if v_resolution.vote_type <> 'yes_no_abstain' then
    perform private.fail('vote_type_not_available');
  end if;
  if v_resolution.mode <> 'electronic' then
    perform private.fail('vote_mode_not_available');
  end if;
  if p_duration_seconds is not null and p_duration_seconds not between 10 and 86400 then
    perform private.fail('invalid_duration');
  end if;
  if exists (select 1 from public.ballots where resolution_id = p_resolution and status <> 'cancelled') then
    perform private.fail('ballot_exists');
  end if;
  if coalesce((v_assembly.settings ->> 'single_open_ballot')::boolean, true)
     and exists (select 1 from public.ballots where assembly_id = v_assembly.id and status = 'open') then
    perform private.fail('ballot_already_open');
  end if;

  -- Pouvoirs en blanc votant selon l'avis du conseil (SA, DECISIONS B7) : l'avis est requis.
  v_blank_auto := v_assembly.proxy_rules ->> 'blank_to' = 'board_recommendation';
  if v_blank_auto and v_resolution.board_recommendation is null and exists (
       select 1 from public.member_presence mp join public.proxies p on p.id = mp.via_proxy_id
       where mp.assembly_id = v_assembly.id and mp.status = 'represented' and p.type = 'blank') then
    perform private.fail('board_recommendation_required');
  end if;

  select coalesce(max(round), 0) + 1 into v_round from public.ballots where resolution_id = p_resolution;
  v_quorum_rule := coalesce(v_resolution.quorum_rule, v_assembly.quorum_rule);

  insert into public.ballots (assembly_id, resolution_id, round, rules_snapshot, opened_by, closes_at)
  values (v_assembly.id, p_resolution, v_round, jsonb_build_object(
      'majority', v_resolution.majority_rule,
      'abstention', v_resolution.abstention_policy,
      'quorum', v_quorum_rule,
      'weight_key_id', v_resolution.weight_key_id,
      'is_secret', v_resolution.is_secret,
      'allow_vote_change', coalesce(v_resolution.allow_vote_change,
                                    (v_assembly.settings ->> 'allow_vote_change')::boolean, true),
      'board_recommendation', v_resolution.board_recommendation,
      'blank_to', v_assembly.proxy_rules ->> 'blank_to',
      'resolution', jsonb_build_object('number', v_resolution.number, 'title', v_resolution.title,
                                       'version', v_resolution.version)),
    auth.uid(),
    case when p_duration_seconds is not null then clock_timestamp() + make_interval(secs => p_duration_seconds) end)
  returning id into v_ballot;

  insert into public.ballot_eligibility (ballot_id, member_id, assembly_id, weight, presence_status,
                                         holder_attendee_id, via_proxy_id, auto_choice)
  select v_ballot, mp.member_id, v_assembly.id, mw.weight, mp.status,
         case when v_blank_auto and p.type = 'blank' then null else mp.holder_attendee_id end,
         mp.via_proxy_id,
         case when v_blank_auto and p.type = 'blank' then v_resolution.board_recommendation end
  from public.member_presence mp
  join public.member_weights mw on mw.member_id = mp.member_id and mw.weight_key_id = v_resolution.weight_key_id
  left join public.proxies p on p.id = mp.via_proxy_id
  where mp.assembly_id = v_assembly.id and mp.status in ('present', 'represented') and mw.weight > 0;

  -- Pouvoirs en blanc (avis du conseil) : votés d'office, tracés comme tels.
  with auto as (
    insert into public.votes (ballot_id, member_id, assembly_id, choice, weight, cast_by_user_id, channel)
    select v_ballot, member_id, v_assembly.id, auto_choice, weight, auth.uid(), 'operator'
    from public.ballot_eligibility where ballot_id = v_ballot and auto_choice is not null
    returning *
  )
  insert into public.vote_events (ballot_id, member_id, choice, weight, revision, cast_by_attendee_id,
                                  cast_by_user_id, channel, idempotency_key, at)
  select ballot_id, member_id, choice, weight, revision, null, cast_by_user_id, channel, null, cast_at from auto;
  get diagnostics v_auto = row_count;

  select jsonb_build_object(
    'present_represented', jsonb_build_object('weight', coalesce(sum(weight), 0), 'heads', count(*)))
  into v_counts
  from public.ballot_eligibility where ballot_id = v_ballot;
  v_counts := v_counts || jsonb_build_object('all_members', (
    select jsonb_build_object('weight', coalesce(sum(weight), 0), 'heads', count(*))
    from public.member_weights where weight_key_id = v_resolution.weight_key_id and weight > 0));
  v_totals := v_counts || jsonb_build_object('quorum', private.evaluate_rule(v_quorum_rule, v_counts),
                                             'auto_votes', v_auto);
  update public.ballots set totals = v_totals where id = v_ballot;

  perform private.audit(v_assembly.org_id, v_assembly.id, 'ballot.opened', jsonb_build_object(
    'ballot_id', v_ballot, 'resolution_id', p_resolution, 'round', v_round, 'totals', v_totals,
    'closes_at', (select closes_at from public.ballots where id = v_ballot)));
  return jsonb_build_object('ballot_id', v_ballot, 'round', v_round, 'totals', v_totals);
end;
$$;

-- Clôture par le bureau ; renvoie le résultat provisoire.
create function public.close_ballot(p_ballot uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly uuid;
begin
  select assembly_id into v_assembly from public.ballots where id = p_ballot;
  if v_assembly is null then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_assembly);
  return private.close_ballot_internal(p_ballot);
end;
$$;

-- Clôture des scrutins dont le minuteur est échu (pg_cron, toutes les 5 s). Entre-temps,
-- cast_votes les refuse déjà.
create function private.close_expired_ballots()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in select id from public.ballots where status = 'open' and closes_at <= clock_timestamp() loop
    begin
      perform private.close_ballot_internal(v_id);
      v_count := v_count + 1;
    exception when sqlstate 'P0001' then
      null;   -- déjà clos entre-temps
    end;
  end loop;
  return v_count;
end;
$$;

-- Validation du résultat par le président de séance : il devient définitif et publiable.
create function public.validate_result(p_ballot uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_org uuid;
  v_result public.results;
begin
  select * into v_ballot from public.ballots where id = p_ballot for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if not private.has_assembly_role(v_ballot.assembly_id, array['president']::public.staff_role[]) then
    perform private.require_bureau(v_ballot.assembly_id);
    perform private.fail('president_only');
  end if;
  if v_ballot.status <> 'closed' then
    perform private.fail('ballot_not_closed');
  end if;
  update public.ballots set status = 'validated', validated_at = clock_timestamp(), validated_by = auth.uid()
  where id = p_ballot;
  select * into v_result from public.results where ballot_id = p_ballot;
  select org_id into v_org from public.assemblies where id = v_ballot.assembly_id;
  perform private.audit(v_org, v_ballot.assembly_id, 'result.validated', jsonb_build_object(
    'ballot_id', p_ballot, 'resolution_id', v_ballot.resolution_id, 'outcome', v_result.outcome,
    'tallies', v_result.tallies));
  return jsonb_build_object('outcome', v_result.outcome, 'tallies', v_result.tallies);
end;
$$;

-- Annulation (erreur de manipulation, incident) avec motif : le scrutin peut être repris
-- (nouveau tour). Un résultat validé ne s'annule pas.
create function public.cancel_ballot(p_ballot uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_org uuid;
begin
  select * into v_ballot from public.ballots where id = p_ballot;
  if not found then
    perform private.fail('not_found');
  end if;
  perform private.require_bureau(v_ballot.assembly_id);
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    perform private.fail('cancel_reason_required');
  end if;
  perform pg_advisory_xact_lock(private.ballot_lock_key(p_ballot));
  select * into v_ballot from public.ballots where id = p_ballot for update;
  if v_ballot.status not in ('open', 'closed') then
    perform private.fail('ballot_not_cancellable');
  end if;
  update public.ballots set status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by = auth.uid(),
    cancelled_reason = trim(p_reason),
    votes_digest = coalesce(votes_digest, private.ballot_votes_digest(p_ballot))
  where id = p_ballot;
  select org_id into v_org from public.assemblies where id = v_ballot.assembly_id;
  perform private.audit(v_org, v_ballot.assembly_id, 'ballot.cancelled', jsonb_build_object(
    'ballot_id', p_ballot, 'resolution_id', v_ballot.resolution_id, 'round', v_ballot.round,
    'previous_status', v_ballot.status, 'reason', trim(p_reason),
    'votes_digest', encode(private.ballot_votes_digest(p_ballot), 'hex')));
end;
$$;

-- Participation en direct (régie) : sans tendance tant que le scrutin est ouvert.
create function public.ballot_progress(p_ballot uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
begin
  select * into v_ballot from public.ballots where id = p_ballot;
  if not found or not private.can_read_assembly(v_ballot.assembly_id) then
    perform private.fail('not_found');
  end if;
  return jsonb_build_object(
    'ballot_id', p_ballot, 'status', v_ballot.status, 'closes_at', v_ballot.closes_at,
    'eligible', v_ballot.totals -> 'present_represented',
    'voted', (select jsonb_build_object('weight', coalesce(sum(weight), 0), 'heads', count(*))
              from public.votes where ballot_id = p_ballot),
    'without_holder', (select count(*) from public.ballot_eligibility
                       where ballot_id = p_ballot and holder_attendee_id is null and auto_choice is null),
    'at', statement_timestamp());
end;
$$;

-- ===== RPC : appareil du votant =====

-- Scrutins ouverts pour l'appareil courant : résolution, voix qu'il porte, choix déjà faits.
create function public.my_ballots()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token public.voter_tokens := private.current_voter_token();
begin
  if v_token.id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'ballot_id', b.id, 'round', b.round, 'opened_at', b.opened_at, 'closes_at', b.closes_at,
        'allow_vote_change', (b.rules_snapshot ->> 'allow_vote_change')::boolean,
        'is_secret', (b.rules_snapshot ->> 'is_secret')::boolean,
        'resolution', jsonb_build_object('id', r.id, 'number', r.number, 'title', r.title, 'body', r.body),
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
              'member_id', e.member_id, 'display_name', m.display_name, 'weight', e.weight,
              'via', case when e.via_proxy_id is null then 'own' else 'proxy' end,
              'choice', v.choice, 'revision', v.revision)
            order by e.via_proxy_id is not null, m.display_name)
          from public.ballot_eligibility e
          join public.members m on m.id = e.member_id
          left join public.votes v on v.ballot_id = e.ballot_id and v.member_id = e.member_id
          where e.ballot_id = b.id and e.holder_attendee_id = v_token.attendee_id), '[]'::jsonb))
      order by b.opened_at)
    from public.ballots b
    join public.resolutions r on r.id = b.resolution_id
    where b.assembly_id = v_token.assembly_id and b.status = 'open'
      and (b.closes_at is null or b.closes_at > statement_timestamp())), '[]'::jsonb);
end;
$$;

-- Vote de l'appareil courant pour un ou plusieurs membres qu'il porte.
--   p_items : [{member_id, choice: for|against|abstain}] ; tout ou rien.
--   p_idempotency_key : générée par l'appareil pour cet envoi ; un réessai renvoie la même réponse.
create function public.cast_votes(p_ballot uuid, p_items jsonb, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots;
  v_attendee uuid;
  v_request public.vote_requests;
  v_members uuid[];
  v_choices text[];
  v_count int;
  v_written int;
  v_response jsonb;
begin
  if p_idempotency_key is null then
    perform private.fail('invalid_request');
  end if;
  select * into v_ballot from public.ballots where id = p_ballot;
  if not found then
    perform private.fail('not_found');
  end if;
  v_attendee := private.current_attendee_id(v_ballot.assembly_id);
  if v_attendee is null then
    perform private.fail('not_found');
  end if;

  -- 1. Idempotence : un envoi concurrent sur la même clé attend la fin du premier.
  insert into public.vote_requests (idempotency_key, ballot_id, attendee_id) values (p_idempotency_key, p_ballot, v_attendee)
  on conflict do nothing;
  if not found then
    select * into v_request from public.vote_requests where idempotency_key = p_idempotency_key;
    if v_request.attendee_id <> v_attendee or v_request.ballot_id <> p_ballot or v_request.response is null then
      perform private.fail('invalid_request');
    end if;
    return v_request.response;
  end if;

  -- 2. Débit : 30 envois par appareil sur 10 secondes.
  if (select count(*) from public.vote_requests
      where attendee_id = v_attendee and created_at > clock_timestamp() - interval '10 seconds') > 30 then
    perform private.fail('rate_limited');
  end if;

  -- 3. Exclusion d'une clôture concurrente (qui prend le verrou en exclusif).
  perform pg_advisory_xact_lock_shared(private.ballot_lock_key(p_ballot));
  select * into v_ballot from public.ballots where id = p_ballot;
  if v_ballot.status <> 'open' or (v_ballot.closes_at is not null and clock_timestamp() >= v_ballot.closes_at) then
    perform private.fail('ballot_not_open');
  end if;

  -- 4. Contrôles, tout ou rien.
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 1000 then
    perform private.fail('invalid_request');
  end if;
  select array_agg(private.try_uuid(x ->> 'member_id') order by n), array_agg(x ->> 'choice' order by n)
  into v_members, v_choices
  from jsonb_array_elements(p_items) with ordinality as t(x, n);
  v_count := cardinality(v_members);
  if exists (select 1 from unnest(v_members, v_choices) as i(member_id, choice)
             where member_id is null or choice is null or choice not in ('for', 'against', 'abstain'))
     or (select count(distinct m) from unnest(v_members) m) <> v_count then
    perform private.fail('invalid_choice');
  end if;
  if exists (select 1 from unnest(v_members) m
             left join public.ballot_eligibility e on e.ballot_id = p_ballot and e.member_id = m
             where e.member_id is null or e.holder_attendee_id is distinct from v_attendee
                   or e.auto_choice is not null) then
    perform private.fail('member_not_held');
  end if;
  if not (v_ballot.rules_snapshot ->> 'allow_vote_change')::boolean
     and exists (select 1 from public.votes v where v.ballot_id = p_ballot and v.member_id = any (v_members)) then
    perform private.fail('vote_already_cast');
  end if;

  -- 5. Écriture et historique.
  with written as (
    insert into public.votes as v (ballot_id, member_id, assembly_id, choice, weight, cast_by_attendee_id, channel,
                                   idempotency_key)
    select p_ballot, i.member_id, v_ballot.assembly_id, i.choice, e.weight, v_attendee, 'device', p_idempotency_key
    from unnest(v_members, v_choices) as i(member_id, choice)
    join public.ballot_eligibility e on e.ballot_id = p_ballot and e.member_id = i.member_id
    on conflict (ballot_id, member_id) do update set
      choice = excluded.choice, revision = v.revision + 1, cast_at = clock_timestamp(),
      cast_by_attendee_id = excluded.cast_by_attendee_id, idempotency_key = excluded.idempotency_key
    -- Garde-fou concurrent : un vote commité entre le contrôle ci-dessus et l'écriture.
    where (v_ballot.rules_snapshot ->> 'allow_vote_change')::boolean
    returning v.*
  )
  insert into public.vote_events (ballot_id, member_id, choice, weight, revision, cast_by_attendee_id,
                                  cast_by_user_id, channel, idempotency_key, at)
  select ballot_id, member_id, choice, weight, revision, cast_by_attendee_id, auth.uid(), channel, idempotency_key,
         cast_at
  from written;
  get diagnostics v_written = row_count;
  if v_written <> v_count then
    perform private.fail('vote_already_cast');
  end if;

  v_response := jsonb_build_object('status', 'recorded', 'ballot_id', p_ballot, 'count', v_written,
    'members', (select jsonb_agg(jsonb_build_object('member_id', member_id, 'choice', choice) order by member_id)
                from unnest(v_members, v_choices) as i(member_id, choice)),
    'at', clock_timestamp());
  update public.vote_requests set response = v_response where idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

-- ===== Statut de l'AG : pas de clôture avec un scrutin ouvert =====
create or replace function public.set_assembly_status(p_assembly uuid, p_to public.assembly_status,
                                                      p_reason text default null)
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
  if not found or not (private.can_manage_assembly(p_assembly) or private.is_bureau(p_assembly)) then
    perform private.fail('not_found');
  end if;
  if (v_assembly.status, p_to) not in (
       ('draft'::public.assembly_status, 'convened'::public.assembly_status),
       ('convened'::public.assembly_status, 'draft'::public.assembly_status),
       ('convened'::public.assembly_status, 'in_session'::public.assembly_status),
       ('in_session'::public.assembly_status, 'closed'::public.assembly_status),
       ('closed'::public.assembly_status, 'archived'::public.assembly_status)) then
    perform private.fail('transition_not_available', jsonb_build_object('from', v_assembly.status, 'to', p_to));
  end if;
  -- Retour en brouillon : impossible une fois l'émargement commencé.
  if p_to = 'draft' and exists (select 1 from public.attendance_events where assembly_id = p_assembly) then
    perform private.fail('transition_not_available', jsonb_build_object('from', v_assembly.status, 'to', p_to));
  end if;
  if p_to = 'in_session' and not exists (select 1 from public.members where assembly_id = p_assembly) then
    perform private.fail('no_members');
  end if;
  if p_to = 'closed' and exists (select 1 from public.ballots where assembly_id = p_assembly and status = 'open') then
    perform private.fail('ballot_open');
  end if;

  update public.assemblies set status = p_to, version = version + 1, updated_at = now()
  where id = p_assembly
  returning version into v_version;

  perform private.audit(v_assembly.org_id, p_assembly, 'assembly.status_changed', jsonb_build_object(
    'from', v_assembly.status, 'to', p_to, 'reason', nullif(trim(p_reason), ''),
    'quorum', case when p_to in ('in_session', 'closed') then public.current_quorum(p_assembly) end));
  return v_version;
end;
$$;

-- ===== Vérification : chaîne d'audit et empreintes des scrutins =====
-- Remplace la version de T1 : une fois la chaîne vérifiée, l'empreinte de chaque scrutin clos
-- (inscrite dans la chaîne) est recalculée à partir des votes.
create or replace function private.verify_audit_chain_unchecked(p_chain_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.audit_log;
  v_prev bytea := '\x'::bytea;
  v_expected_seq bigint := 1;
  v_head public.audit_heads;
  v_ballots int := 0;
begin
  for v_row in
    select * from public.audit_log where chain_id = p_chain_id order by seq
  loop
    if v_row.seq <> v_expected_seq then
      return jsonb_build_object('ok', false, 'count', v_expected_seq - 1,
        'broken_at_seq', v_expected_seq, 'reason', 'missing_or_reordered_entry');
    end if;
    if v_row.prev_hash <> v_prev then
      return jsonb_build_object('ok', false, 'count', v_expected_seq - 1,
        'broken_at_seq', v_row.seq, 'reason', 'prev_hash_mismatch');
    end if;
    if v_row.hash <> private.audit_hash(
         v_row.prev_hash, v_row.chain_id, v_row.org_id, v_row.assembly_id, v_row.seq, v_row.at,
         v_row.actor_user_id, v_row.actor_attendee_id, v_row.action, v_row.payload) then
      return jsonb_build_object('ok', false, 'count', v_expected_seq - 1,
        'broken_at_seq', v_row.seq, 'reason', 'hash_mismatch');
    end if;
    if v_row.action = 'ballot.closed' then
      if v_row.payload ->> 'votes_digest' is distinct from
         encode(private.ballot_votes_digest((v_row.payload ->> 'ballot_id')::uuid), 'hex') then
        return jsonb_build_object('ok', false, 'count', v_expected_seq - 1, 'broken_at_seq', v_row.seq,
          'reason', 'ballot_digest_mismatch', 'ballot_id', v_row.payload ->> 'ballot_id');
      end if;
      v_ballots := v_ballots + 1;
    end if;
    v_prev := v_row.hash;
    v_expected_seq := v_expected_seq + 1;
  end loop;

  select * into v_head from public.audit_heads where chain_id = p_chain_id;
  if coalesce(v_head.seq, 0) <> v_expected_seq - 1 or coalesce(v_head.hash, '\x'::bytea) <> v_prev then
    return jsonb_build_object('ok', false, 'count', v_expected_seq - 1,
      'broken_at_seq', v_expected_seq, 'reason', 'head_mismatch');
  end if;

  return jsonb_build_object('ok', true, 'count', v_expected_seq - 1, 'ballots', v_ballots,
    'last_hash', encode(v_prev, 'hex'));
end;
$$;

grant execute on function
  public.open_ballot(uuid, int),
  public.close_ballot(uuid),
  public.validate_result(uuid),
  public.cancel_ballot(uuid, text),
  public.ballot_progress(uuid),
  public.my_ballots(),
  public.cast_votes(uuid, jsonb, uuid)
to authenticated;

-- Minuteur : clôture automatique des scrutins échus.
select cron.schedule('close-expired-ballots', '5 seconds', $$select private.close_expired_ballots()$$);
