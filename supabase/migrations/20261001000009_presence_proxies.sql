-- 0009 — Moteur de présence et de pouvoirs (SPEC §5.4 à §5.6).
--
-- Principe : les RPC ne modifient que des faits (personnes présentes, membres qu'elles
-- portent en propre, pouvoirs). L'état de présence de chaque membre (member_presence) est
-- ensuite RECALCULÉ à partir de ces faits par une fonction unique, refresh_presence. Aucune
-- mise à jour « à la main » d'un statut : une seule source de vérité, testable.
--
-- Tous les mouvements d'une AG sont sérialisés par un verrou consultatif (lock_presence) :
-- deux postes d'accueil ne peuvent pas, ensemble, faire dépasser un plafond de pouvoirs.

-- ===== Personnes physiques (attendues ou présentes) =====
create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  email extensions.citext check (length(email) <= 254),
  phone text check (length(phone) <= 30),
  is_proxy_ineligible boolean not null default false,   -- ex. syndic non membre
  status public.attendee_status not null default 'expected',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  signature_path text,
  version int not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, assembly_id)
);
create index attendees_assembly_idx on public.attendees (assembly_id, status);

alter table public.assemblies
  add constraint assemblies_president_fk foreign key (president_attendee_id) references public.attendees on delete set null;

-- Membres qu'une personne porte « en propre » : elle-même, ou la personne morale / l'indivision
-- qu'elle représente légalement. Ce n'est pas un pouvoir : pas de plafond. Un membre n'est
-- porté que par une seule personne.
create table public.attendee_members (
  attendee_id uuid not null,
  member_id uuid not null,
  assembly_id uuid not null,
  primary key (attendee_id, member_id),
  unique (member_id),
  foreign key (attendee_id, assembly_id) references public.attendees (id, assembly_id) on delete cascade,
  foreign key (member_id, assembly_id) references public.members (id, assembly_id)
);

-- ===== Pouvoirs =====
create table public.proxies (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  grantor_member_id uuid not null,
  holder_attendee_id uuid,                              -- null : pouvoir en blanc non encore attribué
  type public.proxy_type not null,
  status public.proxy_status not null,
  parent_proxy_id uuid references public.proxies,      -- pouvoir transmis lors d'un départ (5.6)
  return_expected boolean not null default false,      -- départ temporaire (5.6 c)
  document_path text,
  derogation_reason text,
  derogation_by uuid,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_kind text check (revoked_kind in ('manual', 'grantor_present', 'transferred', 'holder_returned',
                                            'president_changed')),
  revoked_reason text,
  foreign key (grantor_member_id, assembly_id) references public.members (id, assembly_id),
  foreign key (holder_attendee_id, assembly_id) references public.attendees (id, assembly_id),
  check ((status = 'pending') = (holder_attendee_id is null)),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (status <> 'pending' or type = 'blank')
);
-- Un seul pouvoir vivant par mandant.
create unique index proxies_one_live_per_grantor on public.proxies (grantor_member_id)
  where status in ('pending', 'active');
create index proxies_holder_idx on public.proxies (holder_attendee_id) where status = 'active';

-- ===== État de présence (calculé) =====
create table public.member_presence (
  member_id uuid primary key,
  assembly_id uuid not null,
  status public.presence_status not null,
  holder_attendee_id uuid,
  via_proxy_id uuid references public.proxies,
  since timestamptz not null default clock_timestamp(),
  version int not null default 1,
  foreign key (member_id, assembly_id) references public.members (id, assembly_id) on delete cascade,
  foreign key (holder_attendee_id, assembly_id) references public.attendees (id, assembly_id),
  check ((status in ('present', 'represented')) = (holder_attendee_id is not null)),
  check ((status = 'represented') = (via_proxy_id is not null))
);
create index member_presence_assembly_idx on public.member_presence (assembly_id, status);
create index member_presence_holder_idx on public.member_presence (holder_attendee_id);

-- ===== Journal des mouvements (ajout seul) =====
create table public.attendance_events (
  id bigint generated always as identity primary key,
  assembly_id uuid not null references public.assemblies on delete cascade,
  attendee_id uuid not null,
  type text not null check (type in ('check_in', 'check_out', 'return')),
  mode text check (mode in ('transfer', 'leave', 'temporary')),
  at timestamptz not null default clock_timestamp(),
  by_user_id uuid,
  payload jsonb not null default '{}'
);
create index attendance_events_assembly_idx on public.attendance_events (assembly_id, id);
create trigger attendance_events_no_update_delete
  before update or delete on public.attendance_events
  for each row execute function private.forbid_mutation();
create trigger attendance_events_no_truncate
  before truncate on public.attendance_events
  for each statement execute function private.forbid_mutation();

-- Un membre porté par une personne ou mandant d'un pouvoir ne se supprime pas (ni à
-- l'unité, ni par un import en mode remplacement).
create function private.guard_member_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.attendee_members where member_id = old.id)
     or exists (select 1 from public.proxies where grantor_member_id = old.id) then
    raise exception using errcode = 'P0001', message = 'member_in_use',
      detail = jsonb_build_object('member_id', old.id, 'display_name', old.display_name)::text;
  end if;
  return old;
end;
$$;
create trigger members_guard_delete before delete on public.members
  for each row execute function private.guard_member_delete();

-- ===== RLS =====
alter table public.attendees enable row level security;
alter table public.attendees force row level security;
alter table public.attendee_members enable row level security;
alter table public.attendee_members force row level security;
alter table public.proxies enable row level security;
alter table public.proxies force row level security;
alter table public.member_presence enable row level security;
alter table public.member_presence force row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_events force row level security;

create policy attendees_select on public.attendees for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy attendee_members_select on public.attendee_members for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy proxies_select on public.proxies for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy member_presence_select on public.member_presence for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy attendance_events_select on public.attendance_events for select to authenticated
  using (private.can_read_assembly(assembly_id));

grant select on public.attendees, public.attendee_members, public.proxies, public.member_presence,
  public.attendance_events to authenticated, service_role;

-- ===== Helpers =====

-- Mouvements de présence d'une AG sérialisés (transactionnel).
create function private.lock_presence(p_assembly uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('presence:' || p_assembly::text, 0));
$$;

-- Opérations de séance (accueil, pouvoirs) : préparation ou rôle d'accueil / de bureau.
create function private.can_operate_assembly(p_assembly uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_assembly(p_assembly)
      or private.has_assembly_role(p_assembly,
           array['reception', 'president', 'secretary', 'scrutineer']::public.staff_role[]);
$$;

-- Dérogations aux règles de pouvoirs : bureau uniquement (SPEC §5.4).
create function private.is_bureau(p_assembly uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_assembly_role(p_assembly, array['president', 'secretary', 'scrutineer']::public.staff_role[]);
$$;
grant execute on function private.can_operate_assembly(uuid), private.is_bureau(uuid) to authenticated, service_role;

-- Verrouille l'AG et vérifie le droit et le statut. Renvoie l'AG.
create function private.lock_assembly_for_operation(p_assembly uuid, p_statuses public.assembly_status[])
returns public.assemblies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies;
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_operate_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  if not v_assembly.status = any (p_statuses) then
    perform private.fail('assembly_locked', jsonb_build_object('status', v_assembly.status));
  end if;
  perform private.lock_presence(p_assembly);
  return v_assembly;
end;
$$;

-- Évalue une règle (quorum ou majorité) sur des valeurs mesurées.
--   p_values : {<numerator|base>: {weight, heads}} ; ex. {"present_represented": {...}, "all_members": {...}}
-- Comparaison exacte par produit croisé (numeric) ; une base nulle ne satisfait aucune condition.
-- Règle null ou sans condition : atteinte.
create function private.evaluate_rule(p_rule jsonb, p_values jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with conditions as (
    select c,
           coalesce((p_values -> (c ->> 'numerator') ->> (c ->> 'measure'))::numeric, 0) as value,
           coalesce((p_values -> (c ->> 'base') ->> (c ->> 'measure'))::numeric, 0) as base
    from jsonb_array_elements(coalesce(p_rule -> 'conditions', '[]'::jsonb)) as c
  ),
  evaluated as (
    select c, value, base,
           base > 0 and case c ->> 'comparison'
             when 'gt' then value * (c ->> 'den')::numeric > (c ->> 'num')::numeric * base
             else value * (c ->> 'den')::numeric >= (c ->> 'num')::numeric * base
           end as met
    from conditions
  )
  select jsonb_build_object(
    'reached', coalesce(bool_and(met), true),
    'conditions', coalesce(jsonb_agg(c || jsonb_build_object('value', value, 'base_value', base, 'met', met)), '[]'::jsonb))
  from evaluated;
$$;

-- Recalcule l'état de présence des membres donnés à partir des faits :
--   porté en propre par une personne présente → present
--   sinon pouvoir actif dont le mandataire est présent → represented
--   sinon : left s'il a été compté auparavant, expected sinon.
-- Renvoie les changements [{member_id, from, to, holder_from, holder_to}].
create function private.refresh_presence(p_assembly uuid, p_members uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  with computed as (
    select m.id as member_id,
      (select am.attendee_id from public.attendee_members am
       join public.attendees a on a.id = am.attendee_id
       where am.member_id = m.id and a.status = 'present') as own_holder,
      (select jsonb_build_object('proxy', p.id, 'holder', p.holder_attendee_id) from public.proxies p
       join public.attendees h on h.id = p.holder_attendee_id
       where p.grantor_member_id = m.id and p.status = 'active' and h.status = 'present') as by_proxy
    from public.members m
    where m.assembly_id = p_assembly and m.id = any (p_members)
  ),
  target as (
    select c.member_id,
      case when c.own_holder is not null then 'present'::public.presence_status
           when c.by_proxy is not null then 'represented'::public.presence_status
           when mp.status in ('present', 'represented', 'left') then 'left'::public.presence_status
           else 'expected'::public.presence_status end as status,
      coalesce(c.own_holder, (c.by_proxy ->> 'holder')::uuid) as holder,
      case when c.own_holder is null then (c.by_proxy ->> 'proxy')::uuid end as via_proxy,
      mp.status as old_status,
      mp.holder_attendee_id as old_holder,
      mp.via_proxy_id as old_proxy
    from computed c
    left join public.member_presence mp on mp.member_id = c.member_id
  ),
  changed as (
    select * from target
    where old_status is distinct from status or old_holder is distinct from holder or old_proxy is distinct from via_proxy
  ),
  written as (
    insert into public.member_presence as mp (member_id, assembly_id, status, holder_attendee_id, via_proxy_id)
    select member_id, p_assembly, status, holder, via_proxy from changed
    on conflict (member_id) do update set
      status = excluded.status,
      holder_attendee_id = excluded.holder_attendee_id,
      via_proxy_id = excluded.via_proxy_id,
      since = clock_timestamp(),
      version = mp.version + 1
    returning mp.member_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', c.member_id, 'from', c.old_status, 'to', c.status,
      'holder_from', c.old_holder, 'holder_to', c.holder)), '[]'::jsonb)
  into v_changes
  from changed c join written w on w.member_id = c.member_id;

  -- Point d'extension : le moteur de scrutin (T10) y applique la règle 5.6.4 aux scrutins ouverts.
  perform private.after_presence_change(p_assembly, v_changes);
  return v_changes;
end;
$$;

-- Sans effet tant que le moteur de scrutin n'existe pas (remplacée en T10).
create function private.after_presence_change(p_assembly uuid, p_changes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_assembly is null or p_changes is null then
    return;
  end if;
end;
$$;

-- Membres « touchés » par une personne : ceux qu'elle porte en propre et les mandants des
-- pouvoirs vivants qu'elle détient.
create function private.attendee_related_members(p_attendee uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct m), '{}') from (
    select member_id as m from public.attendee_members where attendee_id = p_attendee
    union all
    select grantor_member_id from public.proxies where holder_attendee_id = p_attendee and status = 'active'
  ) s;
$$;

-- Contrôle des règles de pouvoirs pour un mandataire qui recevrait p_new_grantors.
-- p_ignore_proxies : pouvoirs déjà comptés à ne pas recompter (transferts en cours).
-- Renvoie la liste des violations (vide si tout est conforme).
create function private.check_proxy_rules(
  p_assembly uuid,
  p_holder uuid,
  p_new_grantors uuid[],
  p_ignore_proxies uuid[] default '{}'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rules jsonb;
  v_violations jsonb := '[]'::jsonb;
  v_holder public.attendees;
  v_primary uuid;
  v_count int;
  v_held numeric;
  v_total numeric;
  v_count_ok boolean;
  v_share_ok boolean;
begin
  select proxy_rules into v_rules from public.assemblies where id = p_assembly;
  select * into v_holder from public.attendees where id = p_holder and assembly_id = p_assembly;

  if v_holder.is_proxy_ineligible or exists (
       select 1 from public.attendee_members am join public.members m on m.id = am.member_id
       where am.attendee_id = p_holder and m.is_proxy_ineligible) then
    v_violations := v_violations || jsonb_build_object('code', 'holder_ineligible');
  end if;
  if exists (select 1 from public.attendee_members where attendee_id = p_holder and member_id = any (p_new_grantors)) then
    v_violations := v_violations || jsonb_build_object('code', 'self_proxy');
  end if;

  -- Plafonds : pouvoirs vivants du mandataire (hors pouvoirs ignorés) + nouveaux.
  select count(*) into v_count from public.proxies
  where holder_attendee_id = p_holder and status = 'active' and not id = any (p_ignore_proxies);
  v_count := v_count + cardinality(p_new_grantors);

  select id into v_primary from public.weight_keys where assembly_id = p_assembly and is_primary;
  select coalesce(sum(weight), 0) into v_total from public.member_weights where weight_key_id = v_primary;
  select coalesce(sum(mw.weight), 0) into v_held
  from public.member_weights mw
  where mw.weight_key_id = v_primary and mw.member_id in (
    select member_id from public.attendee_members where attendee_id = p_holder
    union
    select grantor_member_id from public.proxies
    where holder_attendee_id = p_holder and status = 'active' and not id = any (p_ignore_proxies)
    union
    select unnest(p_new_grantors));

  v_count_ok := jsonb_typeof(v_rules -> 'max_count') = 'null' or v_count <= (v_rules ->> 'max_count')::int;
  v_share_ok := jsonb_typeof(v_rules -> 'max_share') = 'null'
    or v_held * (v_rules -> 'max_share' ->> 'den')::numeric <= (v_rules -> 'max_share' ->> 'num')::numeric * v_total;

  -- « ou » (copropriété) : l'un des deux plafonds respecté suffit, s'ils sont tous deux définis.
  if v_rules ->> 'combine' = 'or'
     and jsonb_typeof(v_rules -> 'max_count') <> 'null' and jsonb_typeof(v_rules -> 'max_share') <> 'null' then
    if not (v_count_ok or v_share_ok) then
      v_violations := v_violations || jsonb_build_object('code', 'proxy_caps_exceeded',
        'count', v_count, 'max_count', v_rules -> 'max_count', 'held', v_held, 'total', v_total,
        'max_share', v_rules -> 'max_share');
    end if;
  else
    if not v_count_ok then
      v_violations := v_violations || jsonb_build_object('code', 'max_count_exceeded',
        'count', v_count, 'max_count', v_rules -> 'max_count');
    end if;
    if not v_share_ok then
      v_violations := v_violations || jsonb_build_object('code', 'max_share_exceeded',
        'held', v_held, 'total', v_total, 'max_share', v_rules -> 'max_share');
    end if;
  end if;
  return v_violations;
end;
$$;

-- Applique le résultat d'un contrôle : refus, ou dérogation motivée par un membre du bureau.
create function private.enforce_proxy_rules(p_assembly public.assemblies, p_violations jsonb, p_derogation text,
                                            p_context jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_array_length(p_violations) = 0 then
    return false;
  end if;
  -- Un mandataire ne peut jamais être son propre mandant, même par dérogation.
  if exists (select 1 from jsonb_array_elements(p_violations) v where v ->> 'code' = 'self_proxy') then
    perform private.fail('proxy_rule_violation', p_violations);
  end if;
  if nullif(trim(p_derogation), '') is null or not private.is_bureau(p_assembly.id) then
    perform private.fail('proxy_rule_violation', p_violations);
  end if;
  perform private.audit(p_assembly.org_id, p_assembly.id, 'proxy.derogation',
    p_context || jsonb_build_object('violations', p_violations, 'reason', trim(p_derogation)));
  return true;
end;
$$;

-- Portefeuille d'une personne : voix portées en propre et par pouvoir, par clé.
create function private.attendee_portfolio(p_attendee uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with held as (
    select am.member_id, 'own' as via, null::uuid as proxy_id
    from public.attendee_members am where am.attendee_id = p_attendee
    union all
    select p.grantor_member_id, 'proxy', p.id
    from public.proxies p where p.holder_attendee_id = p_attendee and p.status = 'active'
  )
  select jsonb_build_object(
    'attendee_id', p_attendee,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', m.id, 'display_name', m.display_name,
                                          'external_ref', m.external_ref, 'via', h.via, 'proxy_id', h.proxy_id)
                       order by h.via desc, m.display_name)
      from held h join public.members m on m.id = h.member_id), '[]'::jsonb),
    'totals', coalesce((
      select jsonb_agg(jsonb_build_object('code', k.code, 'label', k.label, 'weight', t.weight) order by k.position)
      from (select mw.weight_key_id, sum(mw.weight) as weight
            from held h join public.member_weights mw on mw.member_id = h.member_id
            group by mw.weight_key_id) t
      join public.weight_keys k on k.id = t.weight_key_id), '[]'::jsonb));
$$;

-- ===== RPC : personnes =====

-- Crée ou modifie une personne attendue (membre lui-même, représentant légal, mandataire tiers).
create function public.upsert_attendee(
  p_assembly uuid,
  p_attendee uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_member_ids uuid[],
  p_is_proxy_ineligible boolean,
  p_expected_version int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_operation(p_assembly,
    array['draft', 'convened', 'in_session']::public.assembly_status[]);
  v_before public.attendees;
  v_id uuid;
  v_members uuid[] := coalesce(p_member_ids, '{}');
  v_old_members uuid[] := '{}'::uuid[];
begin
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 200 then
    perform private.fail('invalid_name');
  end if;
  if nullif(trim(p_email), '') is not null and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform private.fail('invalid_email');
  end if;
  if exists (select 1 from unnest(v_members) x
             where not exists (select 1 from public.members where id = x and assembly_id = p_assembly)) then
    perform private.fail('not_found');
  end if;
  if exists (select 1 from public.attendee_members
             where member_id = any (v_members) and attendee_id is distinct from p_attendee) then
    perform private.fail('member_already_embodied');
  end if;

  if p_attendee is null then
    insert into public.attendees (assembly_id, full_name, email, phone, is_proxy_ineligible, created_by)
    values (p_assembly, trim(p_full_name), nullif(lower(trim(p_email)), ''), nullif(trim(p_phone), ''),
            coalesce(p_is_proxy_ineligible, false), auth.uid())
    returning id into v_id;
  else
    select * into v_before from public.attendees where id = p_attendee and assembly_id = p_assembly for update;
    if not found then
      perform private.fail('not_found');
    end if;
    if p_expected_version is not null and v_before.version <> p_expected_version then
      perform private.fail('version_conflict', jsonb_build_object('current', v_before.version));
    end if;
    -- Une personne présente porte des voix : ses membres ne changent plus qu'en la faisant sortir.
    select coalesce(array_agg(member_id), '{}') into v_old_members from public.attendee_members where attendee_id = p_attendee;
    if v_before.status = 'present' and not (v_old_members @> v_members and v_members @> v_old_members) then
      perform private.fail('attendee_present');
    end if;
    update public.attendees set
      full_name = trim(p_full_name), email = nullif(lower(trim(p_email)), ''), phone = nullif(trim(p_phone), ''),
      is_proxy_ineligible = coalesce(p_is_proxy_ineligible, false), version = version + 1
    where id = p_attendee
    returning id into v_id;
    delete from public.attendee_members where attendee_id = v_id and not member_id = any (v_members);
  end if;

  insert into public.attendee_members (attendee_id, member_id, assembly_id)
  select v_id, x, p_assembly from unnest(v_members) x
  on conflict do nothing;

  perform private.audit(v_assembly.org_id, p_assembly,
    case when p_attendee is null then 'attendee.created' else 'attendee.updated' end,
    jsonb_build_object('attendee_id', v_id, 'full_name', trim(p_full_name), 'member_ids', to_jsonb(v_members),
                       'is_proxy_ineligible', coalesce(p_is_proxy_ineligible, false)));
  return v_id;
end;
$$;

-- Désigne le président de séance et lui attribue les pouvoirs en blanc (DECISIONS : les
-- pouvoirs en blanc ne sont pas soumis aux plafonds, à valider juridiquement).
create function public.set_president(p_assembly uuid, p_attendee uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_operation(p_assembly,
    array['draft', 'convened', 'in_session']::public.assembly_status[]);
  v_moved uuid[];
begin
  if not (private.can_manage_assembly(p_assembly) or private.is_bureau(p_assembly)) then
    perform private.fail('forbidden');
  end if;
  if p_attendee is not null and not exists (
       select 1 from public.attendees where id = p_attendee and assembly_id = p_assembly) then
    perform private.fail('not_found');
  end if;
  if p_attendee is not null and exists (
       select 1 from public.attendees where id = p_attendee and is_proxy_ineligible) then
    perform private.fail('proxy_rule_violation', jsonb_build_array(jsonb_build_object('code', 'holder_ineligible')));
  end if;

  update public.assemblies set president_attendee_id = p_attendee, version = version + 1, updated_at = now()
  where id = p_assembly;

  -- Pouvoirs en blanc déjà attribués à un autre président : réattribués.
  with old as (
    update public.proxies set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = auth.uid(),
      revoked_kind = 'president_changed'
    where assembly_id = p_assembly and type = 'blank' and status = 'active'
      and holder_attendee_id is distinct from p_attendee
    returning *
  )
  insert into public.proxies (assembly_id, grantor_member_id, holder_attendee_id, type, status, parent_proxy_id,
                              document_path, created_by)
  select assembly_id, grantor_member_id, p_attendee, 'blank',
         case when p_attendee is null then 'pending'::public.proxy_status else 'active' end,
         id, document_path, auth.uid()
  from old;

  -- Pouvoirs en blanc en attente : attribués au nouveau président.
  if p_attendee is not null then
    update public.proxies set holder_attendee_id = p_attendee, status = 'active'
    where assembly_id = p_assembly and type = 'blank' and status = 'pending';
  end if;

  select coalesce(array_agg(grantor_member_id), '{}') into v_moved
  from public.proxies where assembly_id = p_assembly and type = 'blank' and status in ('active', 'pending');
  perform private.refresh_presence(p_assembly, v_moved);

  perform private.audit(v_assembly.org_id, p_assembly, 'president.set', jsonb_build_object(
    'attendee_id', p_attendee, 'previous', v_assembly.president_attendee_id, 'blank_proxies', cardinality(v_moved)));
  return jsonb_build_object('president_attendee_id', p_attendee, 'blank_proxies', cardinality(v_moved));
end;
$$;

-- ===== RPC : pouvoirs =====
create function public.grant_proxy(
  p_assembly uuid,
  p_grantor uuid,
  p_holder uuid,
  p_type public.proxy_type,
  p_document_path text default null,
  p_derogation_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_operation(p_assembly,
    array['draft', 'convened', 'in_session']::public.assembly_status[]);
  v_holder uuid := p_holder;
  v_status public.proxy_status := 'active'::public.proxy_status;
  v_derogation boolean := false;
  v_id uuid;
begin
  if not exists (select 1 from public.members where id = p_grantor and assembly_id = p_assembly) then
    perform private.fail('not_found');
  end if;
  if p_type = 'temporary' then
    perform private.fail('invalid_proxy_type');   -- réservé aux départs (check_out)
  end if;
  if exists (select 1 from public.proxies where grantor_member_id = p_grantor and status in ('pending', 'active')) then
    perform private.fail('proxy_exists');
  end if;
  if exists (select 1 from public.attendee_members am join public.attendees a on a.id = am.attendee_id
             where am.member_id = p_grantor and a.status = 'present') then
    perform private.fail('grantor_present');
  end if;

  if p_type = 'blank' then
    if v_assembly.proxy_rules ->> 'blank_to' = 'none' then
      perform private.fail('blank_proxy_not_allowed');
    end if;
    v_holder := v_assembly.president_attendee_id;
    v_status := case when v_holder is null then 'pending'::public.proxy_status else 'active'::public.proxy_status end;
  else
    if v_holder is null or not exists (select 1 from public.attendees where id = v_holder and assembly_id = p_assembly) then
      perform private.fail('not_found');
    end if;
    v_derogation := private.enforce_proxy_rules(v_assembly,
      private.check_proxy_rules(p_assembly, v_holder, array[p_grantor]), p_derogation_reason,
      jsonb_build_object('grantor_member_id', p_grantor, 'holder_attendee_id', v_holder));
  end if;

  insert into public.proxies (assembly_id, grantor_member_id, holder_attendee_id, type, status, document_path,
                              derogation_reason, derogation_by, created_by)
  values (p_assembly, p_grantor, v_holder, p_type, v_status, nullif(trim(p_document_path), ''),
          case when v_derogation then trim(p_derogation_reason) end,
          case when v_derogation then auth.uid() end, auth.uid())
  returning id into v_id;

  perform private.refresh_presence(p_assembly, array[p_grantor]);
  perform private.audit(v_assembly.org_id, p_assembly, 'proxy.granted', jsonb_build_object(
    'proxy_id', v_id, 'grantor_member_id', p_grantor, 'holder_attendee_id', v_holder, 'type', p_type,
    'status', v_status, 'derogation', v_derogation));
  return v_id;
end;
$$;

create function public.revoke_proxy(p_proxy uuid, p_reason text default null)
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
  select * into v_proxy from public.proxies where id = p_proxy for update;
  if v_proxy.status = 'revoked' then
    perform private.fail('proxy_revoked');
  end if;

  update public.proxies set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = auth.uid(),
    revoked_kind = 'manual', revoked_reason = nullif(trim(p_reason), '')
  where id = p_proxy;
  perform private.refresh_presence(v_proxy.assembly_id, array[v_proxy.grantor_member_id]);
  perform private.audit(v_assembly.org_id, v_proxy.assembly_id, 'proxy.revoked', jsonb_build_object(
    'proxy_id', p_proxy, 'grantor_member_id', v_proxy.grantor_member_id, 'reason', nullif(trim(p_reason), '')));
end;
$$;

-- ===== RPC : émargement =====

-- Arrivée d'une personne. p_new_attendee {full_name, email?, phone?, member_ids?} crée sur place
-- une personne non prévue (tracé). Un pouvoir donné par un membre qui arrive en personne est
-- révoqué : il reprend ses voix (SPEC §5.4).
create function public.check_in(
  p_assembly uuid,
  p_attendee uuid,
  p_new_attendee jsonb default null,
  p_signature_path text default null,
  p_expected_version int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_operation(p_assembly,
    array['convened', 'in_session']::public.assembly_status[]);
  v_attendee public.attendees;
  v_id uuid := p_attendee;
  v_revoked uuid[];
  v_changes jsonb;
begin
  if v_id is null then
    if jsonb_typeof(p_new_attendee) is distinct from 'object' then
      perform private.fail('not_found');
    end if;
    v_id := public.upsert_attendee(p_assembly, null, p_new_attendee ->> 'full_name', p_new_attendee ->> 'email',
      p_new_attendee ->> 'phone',
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_new_attendee -> 'member_ids') x), '{}'),
      coalesce((p_new_attendee ->> 'is_proxy_ineligible')::boolean, false));
  end if;

  select * into v_attendee from public.attendees where id = v_id and assembly_id = p_assembly for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if p_expected_version is not null and v_attendee.version <> p_expected_version then
    perform private.fail('version_conflict', jsonb_build_object('current', v_attendee.version));
  end if;
  if v_attendee.status <> 'expected' then
    perform private.fail('attendee_not_expected', jsonb_build_object('status', v_attendee.status));
  end if;
  if p_signature_path is not null and split_part(p_signature_path, '/', 1) <> p_assembly::text then
    perform private.fail('invalid_signature');
  end if;

  update public.attendees set status = 'present', checked_in_at = clock_timestamp(),
    signature_path = coalesce(p_signature_path, signature_path), version = version + 1
  where id = v_id;

  -- Mandant présent en personne : son pouvoir tombe.
  with revoked as (
    update public.proxies p set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = auth.uid(),
      revoked_kind = 'grantor_present'
    where p.status in ('pending', 'active')
      and p.grantor_member_id in (select member_id from public.attendee_members where attendee_id = v_id)
    returning p.id
  )
  select coalesce(array_agg(id), '{}') into v_revoked from revoked;

  v_changes := private.refresh_presence(p_assembly, private.attendee_related_members(v_id)
    || (select coalesce(array_agg(grantor_member_id), '{}') from public.proxies where id = any (v_revoked)));

  insert into public.attendance_events (assembly_id, attendee_id, type, by_user_id, payload)
  values (p_assembly, v_id, 'check_in', auth.uid(), jsonb_build_object(
    'created_on_site', p_attendee is null, 'revoked_proxies', to_jsonb(v_revoked),
    'signature', p_signature_path is not null));
  perform private.audit(v_assembly.org_id, p_assembly, 'attendee.checked_in', jsonb_build_object(
    'attendee_id', v_id, 'created_on_site', p_attendee is null, 'revoked_proxies', to_jsonb(v_revoked),
    'changes', v_changes));
  return private.attendee_portfolio(v_id);
end;
$$;

-- Départ en cours de séance (SPEC §5.6).
--   transfer  : voix propres confiées à p_transfer_to ; pouvoirs détenus transmis si les règles
--               le permettent (sous-délégation autorisée, ou transmission au départ, DECISIONS B1)
--   temporary : idem, avec retour prévu (return_attendee restitue tout)
--   leave     : sortie sans transmission ; voix et pouvoirs sortent du décompte
-- Les plafonds s'appliquent au nouveau mandataire ; tout ou rien.
create function public.check_out(
  p_attendee uuid,
  p_mode text,
  p_transfer_to uuid default null,
  p_expected_version int default null,
  p_derogation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendee public.attendees;
  v_assembly public.assemblies;
  v_target public.attendees;
  v_own uuid[];
  v_held public.proxies[];
  v_transfer_held boolean;
  v_new_grantors uuid[];
  v_derogation boolean := false;
  v_changes jsonb;
  v_held_ids uuid[];
  v_dropped uuid[] := '{}'::uuid[];
begin
  select * into v_attendee from public.attendees where id = p_attendee;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_operation(v_attendee.assembly_id,
    array['convened', 'in_session']::public.assembly_status[]);
  select * into v_attendee from public.attendees where id = p_attendee for update;
  if p_mode is null or p_mode not in ('transfer', 'leave', 'temporary') then
    perform private.fail('invalid_mode');
  end if;
  if p_expected_version is not null and v_attendee.version <> p_expected_version then
    perform private.fail('version_conflict', jsonb_build_object('current', v_attendee.version));
  end if;
  if v_attendee.status <> 'present' then
    perform private.fail('attendee_not_present');
  end if;

  select coalesce(array_agg(member_id), '{}') into v_own from public.attendee_members where attendee_id = p_attendee;
  select coalesce(array_agg(p), '{}') into v_held from public.proxies p
  where holder_attendee_id = p_attendee and status = 'active';
  select coalesce(array_agg(id), '{}') into v_held_ids from unnest(v_held);

  if p_mode in ('transfer', 'temporary') then
    select * into v_target from public.attendees where id = p_transfer_to and assembly_id = v_attendee.assembly_id;
    if not found or p_transfer_to = p_attendee then
      perform private.fail('invalid_transfer_target');
    end if;
    if v_target.status <> 'present' then
      perform private.fail('transfer_target_not_present');
    end if;

    v_transfer_held := not (v_assembly.proxy_rules ->> 'forbid_subdelegation')::boolean
                       or (v_assembly.proxy_rules ->> 'allow_transfer_on_departure')::boolean;
    v_new_grantors := v_own || case when v_transfer_held
      then (select coalesce(array_agg(grantor_member_id), '{}') from unnest(v_held)) else '{}' end;
    if not v_transfer_held then
      v_dropped := v_held_ids;
    end if;

    v_derogation := private.enforce_proxy_rules(v_assembly,
      private.check_proxy_rules(v_attendee.assembly_id, p_transfer_to, v_new_grantors), p_derogation_reason,
      jsonb_build_object('from_attendee_id', p_attendee, 'holder_attendee_id', p_transfer_to,
                         'grantors', to_jsonb(v_new_grantors)));

    -- Voix propres : pouvoir temporaire au nouveau mandataire.
    insert into public.proxies (assembly_id, grantor_member_id, holder_attendee_id, type, status, return_expected,
                                derogation_reason, derogation_by, created_by)
    select v_attendee.assembly_id, m, p_transfer_to, 'temporary', 'active', p_mode = 'temporary',
           case when v_derogation then trim(p_derogation_reason) end, case when v_derogation then auth.uid() end,
           auth.uid()
    from unnest(v_own) m;

    -- Pouvoirs détenus : transmis (chaînés au pouvoir d'origine), sinon conservés en attente du retour.
    if v_transfer_held then
      update public.proxies set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = auth.uid(),
        revoked_kind = 'transferred'
      where id = any (v_held_ids);
      insert into public.proxies (assembly_id, grantor_member_id, holder_attendee_id, type, status, parent_proxy_id,
                                  return_expected, derogation_reason, derogation_by, created_by)
      select v_attendee.assembly_id, (h).grantor_member_id, p_transfer_to, 'temporary', 'active', (h).id,
             p_mode = 'temporary', case when v_derogation then trim(p_derogation_reason) end,
             case when v_derogation then auth.uid() end, auth.uid()
      from unnest(v_held) h;
    end if;
  elsif p_transfer_to is not null then
    perform private.fail('invalid_transfer_target');
  end if;

  update public.attendees set status = 'left', checked_out_at = clock_timestamp(), version = version + 1
  where id = p_attendee;

  v_changes := private.refresh_presence(v_attendee.assembly_id,
    v_own || (select coalesce(array_agg(grantor_member_id), '{}') from unnest(v_held)));

  insert into public.attendance_events (assembly_id, attendee_id, type, mode, by_user_id, payload)
  values (v_attendee.assembly_id, p_attendee, 'check_out', p_mode, auth.uid(), jsonb_build_object(
    'transfer_to', p_transfer_to, 'own_members', to_jsonb(v_own), 'held_proxies', to_jsonb(v_held_ids),
    'held_proxies_kept_pending_return', to_jsonb(v_dropped), 'derogation', v_derogation));
  perform private.audit(v_assembly.org_id, v_attendee.assembly_id, 'attendee.checked_out', jsonb_build_object(
    'attendee_id', p_attendee, 'mode', p_mode, 'transfer_to', p_transfer_to, 'derogation', v_derogation,
    'changes', v_changes));

  return jsonb_build_object('mode', p_mode, 'changes', v_changes,
    'held_proxies_not_transferred', to_jsonb(v_dropped),
    'target_portfolio', case when p_transfer_to is not null then private.attendee_portfolio(p_transfer_to) end);
end;
$$;

-- Retour d'une personne partie. Ses voix propres lui reviennent toujours (mandant présent) ;
-- les pouvoirs qu'elle détenait lui reviennent s'ils avaient été transmis avec retour prévu, ou
-- s'ils n'avaient pas été transmis.
create function public.return_attendee(p_attendee uuid, p_expected_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendee public.attendees;
  v_assembly public.assemblies;
  v_affected uuid[];
  v_restored int;
  v_changes jsonb;
begin
  select * into v_attendee from public.attendees where id = p_attendee;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_operation(v_attendee.assembly_id,
    array['convened', 'in_session']::public.assembly_status[]);
  select * into v_attendee from public.attendees where id = p_attendee for update;
  if p_expected_version is not null and v_attendee.version <> p_expected_version then
    perform private.fail('version_conflict', jsonb_build_object('current', v_attendee.version));
  end if;
  if v_attendee.status <> 'left' then
    perform private.fail('attendee_not_left');
  end if;

  update public.attendees set status = 'present', checked_out_at = null, version = version + 1 where id = p_attendee;

  -- Voix propres : le pouvoir temporaire tombe.
  update public.proxies set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = auth.uid(),
    revoked_kind = 'grantor_present'
  where status = 'active'
    and grantor_member_id in (select member_id from public.attendee_members where attendee_id = p_attendee);

  -- Pouvoirs transmis avec retour prévu : rendus (nouveau pouvoir chaîné au pouvoir temporaire).
  with returned as (
    update public.proxies c set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = auth.uid(),
      revoked_kind = 'holder_returned'
    from public.proxies parent
    where c.parent_proxy_id = parent.id and parent.holder_attendee_id = p_attendee
      and c.status = 'active' and c.return_expected
    returning c.*, parent.type as original_type
  )
  insert into public.proxies (assembly_id, grantor_member_id, holder_attendee_id, type, status, parent_proxy_id,
                              created_by)
  select assembly_id, grantor_member_id, p_attendee, original_type, 'active', id, auth.uid() from returned;
  get diagnostics v_restored = row_count;

  select private.attendee_related_members(p_attendee) into v_affected;
  v_changes := private.refresh_presence(v_attendee.assembly_id, v_affected);

  insert into public.attendance_events (assembly_id, attendee_id, type, by_user_id, payload)
  values (v_attendee.assembly_id, p_attendee, 'return', auth.uid(),
          jsonb_build_object('restored_proxies', v_restored));
  perform private.audit(v_assembly.org_id, v_attendee.assembly_id, 'attendee.returned', jsonb_build_object(
    'attendee_id', p_attendee, 'restored_proxies', v_restored, 'changes', v_changes));
  return private.attendee_portfolio(p_attendee);
end;
$$;

-- ===== RPC : lecture =====

-- Quorum en temps réel sur une clé (clé principale par défaut), selon la règle de l'AG.
create function public.current_quorum(p_assembly uuid, p_weight_key uuid default null)
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
begin
  select * into v_assembly from public.assemblies where id = p_assembly;
  if not found or not private.can_read_assembly(p_assembly) then
    perform private.fail('not_found');
  end if;
  select * into v_key from public.weight_keys
  where assembly_id = p_assembly and (id = p_weight_key or (p_weight_key is null and is_primary));
  if not found then
    perform private.fail('not_found');
  end if;

  with by_member as (
    select mw.weight, coalesce(mp.status, 'expected'::public.presence_status) as status
    from public.member_weights mw
    left join public.member_presence mp on mp.member_id = mw.member_id
    where mw.weight_key_id = v_key.id and mw.weight > 0
  )
  select jsonb_build_object(
    'present', jsonb_build_object('weight', coalesce(sum(weight) filter (where status = 'present'), 0),
                                  'heads', count(*) filter (where status = 'present')),
    'represented', jsonb_build_object('weight', coalesce(sum(weight) filter (where status = 'represented'), 0),
                                      'heads', count(*) filter (where status = 'represented')),
    'present_represented', jsonb_build_object(
      'weight', coalesce(sum(weight) filter (where status in ('present', 'represented')), 0),
      'heads', count(*) filter (where status in ('present', 'represented'))),
    'left', jsonb_build_object('weight', coalesce(sum(weight) filter (where status = 'left'), 0),
                               'heads', count(*) filter (where status = 'left')),
    'expected', jsonb_build_object('weight', coalesce(sum(weight) filter (where status = 'expected'), 0),
                                   'heads', count(*) filter (where status = 'expected')),
    'all_members', jsonb_build_object('weight', coalesce(sum(weight), 0), 'heads', count(*)))
  into v_counts
  from by_member;

  return jsonb_build_object(
    'weight_key', jsonb_build_object('id', v_key.id, 'code', v_key.code, 'label', v_key.label),
    'counts', v_counts,
    'rule', v_assembly.quorum_rule,
    'evaluation', private.evaluate_rule(v_assembly.quorum_rule, v_counts),
    'computed_at', statement_timestamp());
end;
$$;

create function public.attendee_portfolio(p_attendee uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assembly uuid;
begin
  select assembly_id into v_assembly from public.attendees where id = p_attendee;
  if v_assembly is null or not private.can_read_assembly(v_assembly) then
    perform private.fail('not_found');
  end if;
  return private.attendee_portfolio(p_attendee);
end;
$$;

-- ===== Statut : séance et clôture =====
-- Remplace la version de T3 : ajoute convoquée → en séance, en séance → close, close → archivée.
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

  update public.assemblies set status = p_to, version = version + 1, updated_at = now()
  where id = p_assembly
  returning version into v_version;

  perform private.audit(v_assembly.org_id, p_assembly, 'assembly.status_changed', jsonb_build_object(
    'from', v_assembly.status, 'to', p_to, 'reason', nullif(trim(p_reason), ''),
    'quorum', case when p_to in ('in_session', 'closed') then public.current_quorum(p_assembly) end));
  return v_version;
end;
$$;

grant execute on function
  public.upsert_attendee(uuid, uuid, text, text, text, uuid[], boolean, int),
  public.set_president(uuid, uuid),
  public.grant_proxy(uuid, uuid, uuid, public.proxy_type, text, text),
  public.revoke_proxy(uuid, text),
  public.check_in(uuid, uuid, jsonb, text, int),
  public.check_out(uuid, text, uuid, int, text),
  public.return_attendee(uuid, int),
  public.current_quorum(uuid, uuid),
  public.attendee_portfolio(uuid)
to authenticated;
