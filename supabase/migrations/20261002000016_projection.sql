-- 0016 — Écran de projection (SPEC §5.11).
--
-- L'écran public n'a ni compte ni session : il présente un jeton de projection (24 caractères
-- Crockford, ~120 bits) dont seule l'empreinte est conservée. Le lien est émis par la
-- préparation ou le bureau ; en émettre un nouveau invalide l'ancien. Le jeton voyage dans le
-- fragment de l'URL (/projection#JETON), jamais envoyé au serveur web.
-- L'état projeté ne contient que des agrégats publics : titre, quorum de la clé principale,
-- résolution en cours avec sa participation (sans tendance), dernier résultat VALIDÉ.

-- Lien de projection d'une AG : aucun accès client (ni lecture ni écriture), RPC seulement.
create table public.projection_links (
  assembly_id uuid primary key references public.assemblies on delete cascade,
  token_hash bytea not null unique,
  issued_by uuid,
  issued_at timestamptz not null default clock_timestamp()
);
alter table public.projection_links enable row level security;
alter table public.projection_links force row level security;

create function public.rotate_projection_token(p_assembly uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_token text := private.random_code(24);
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if not found or not (private.can_manage_assembly(p_assembly) or private.is_bureau(p_assembly)) then
    perform private.fail('not_found');
  end if;
  if v_assembly.status in ('draft', 'archived') then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  insert into public.projection_links (assembly_id, token_hash, issued_by)
  values (p_assembly, extensions.digest(v_token, 'sha256'), auth.uid())
  on conflict (assembly_id) do update set token_hash = excluded.token_hash, issued_by = excluded.issued_by,
    issued_at = clock_timestamp();
  perform private.audit(v_assembly.org_id, p_assembly, 'projection.link_issued', '{}'::jsonb);
  return v_token;
end;
$$;

create function public.revoke_projection_token(p_assembly uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly for update;
  if not found or not (private.can_manage_assembly(p_assembly) or private.is_bureau(p_assembly)) then
    perform private.fail('not_found');
  end if;
  delete from public.projection_links where assembly_id = p_assembly;
  perform private.audit(v_assembly.org_id, p_assembly, 'projection.link_revoked', '{}'::jsonb);
end;
$$;

-- État affiché par l'écran de projection ; null si le jeton est inconnu ou l'AG non projetable.
create function public.projection_state(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
  v_key public.weight_keys;
  v_counts jsonb;
  v_open public.ballots;
  v_result record;
begin
  if p_token is null or length(p_token) > 64 then
    return null;
  end if;
  select a.* into v_assembly from public.assemblies a
  join public.projection_links l on l.assembly_id = a.id
  where l.token_hash = extensions.digest(private.normalize_code(p_token), 'sha256');
  if not found or v_assembly.status not in ('convened', 'in_session', 'closed') then
    return null;
  end if;

  select * into v_key from public.weight_keys where assembly_id = v_assembly.id and is_primary;
  select jsonb_build_object(
      'present_represented', jsonb_build_object(
        'weight', coalesce(sum(mw.weight) filter (where mp.status in ('present', 'represented')), 0),
        'heads', count(*) filter (where mp.status in ('present', 'represented'))),
      'all_members', jsonb_build_object('weight', coalesce(sum(mw.weight), 0), 'heads', count(*)))
  into v_counts
  from public.member_weights mw
  left join public.member_presence mp on mp.member_id = mw.member_id
  where mw.weight_key_id = v_key.id and mw.weight > 0;

  select * into v_open from public.ballots where assembly_id = v_assembly.id and status = 'open'
  order by opened_at desc limit 1;

  select b.id, r.number, r.title, res.outcome, res.tallies, b.validated_at
  into v_result
  from public.ballots b
  join public.resolutions r on r.id = b.resolution_id
  join public.results res on res.ballot_id = b.id
  where b.assembly_id = v_assembly.id and b.status = 'validated'
  order by b.validated_at desc limit 1;

  return jsonb_build_object(
    'assembly', jsonb_build_object('title', v_assembly.title, 'status', v_assembly.status),
    'quorum', jsonb_build_object(
      'weight_key', v_key.label, 'counts', v_counts,
      'has_rule', jsonb_array_length(coalesce(v_assembly.quorum_rule -> 'conditions', '[]'::jsonb)) > 0,
      'reached', (private.evaluate_rule(v_assembly.quorum_rule, v_counts) ->> 'reached')::boolean),
    'current', case when v_open.id is not null then jsonb_build_object(
      'number', (select number from public.resolutions where id = v_open.resolution_id),
      'title', (select title from public.resolutions where id = v_open.resolution_id),
      'closes_at', v_open.closes_at,
      'eligible', v_open.totals -> 'present_represented',
      'voted', (select jsonb_build_object('weight', coalesce(sum(weight), 0), 'heads', count(*))
                from public.votes where ballot_id = v_open.id)) end,
    'result', case when v_result.id is not null then jsonb_build_object(
      'number', v_result.number, 'title', v_result.title, 'outcome', v_result.outcome,
      'validated_at', v_result.validated_at,
      'tallies', jsonb_build_object(
        'for', v_result.tallies -> 'for', 'against', v_result.tallies -> 'against',
        'abstain', v_result.tallies -> 'abstain', 'expressed', v_result.tallies -> 'expressed')) end,
    'at', statement_timestamp());
end;
$$;

grant execute on function public.rotate_projection_token(uuid), public.revoke_projection_token(uuid)
  to authenticated;
grant execute on function public.projection_state(text) to anon, authenticated;
