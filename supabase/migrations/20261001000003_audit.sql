-- 0003 — Journal d'audit chaîné, en ajout seul (SPEC §6, plan §2.6).
--
-- Une chaîne par périmètre : l'assemblée pour les événements de séance, l'organisation
-- pour les événements d'administration (chain_id = coalesce(assembly_id, org_id)).
-- Chaque ligne contient le hash de la précédente : toute altération, suppression ou
-- insertion hors séquence est détectée par verify_audit_chain().
--
-- Les votes individuels ne passent pas par cette chaîne (verrou sérialisant à 500 votes/s) :
-- ils sont scellés à la clôture du scrutin par une empreinte inscrite ici (T10).

create table public.audit_heads (
  chain_id uuid primary key,
  seq bigint not null check (seq >= 0),
  hash bytea not null
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  chain_id uuid not null,
  org_id uuid not null references public.organizations,
  assembly_id uuid,                          -- clé étrangère ajoutée avec les assemblées (T3)
  seq bigint not null check (seq > 0),
  at timestamptz not null,
  actor_user_id uuid,
  actor_attendee_id uuid,
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  payload jsonb not null default '{}',
  prev_hash bytea not null,
  hash bytea not null,
  unique (chain_id, seq),
  check (chain_id = coalesce(assembly_id, org_id))
);
create index audit_log_org_idx on public.audit_log (org_id, at);

-- ===== Hash canonique d'une ligne =====
-- Champs séparés par '|', null encodé en chaîne vide (concat_ws ignorerait les nulls
-- et décalerait les champs). L'horodatage est rendu en UTC à la microseconde pour ne
-- pas dépendre du fuseau de la session. jsonb::text est déterministe (clés normalisées).
create function private.audit_hash(
  p_prev_hash bytea,
  p_chain_id uuid,
  p_org_id uuid,
  p_assembly_id uuid,
  p_seq bigint,
  p_at timestamptz,
  p_actor_user_id uuid,
  p_actor_attendee_id uuid,
  p_action text,
  p_payload jsonb
)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(
    p_prev_hash || convert_to(
      concat_ws('|',
        p_chain_id::text,
        p_org_id::text,
        coalesce(p_assembly_id::text, ''),
        p_seq::text,
        to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        coalesce(p_actor_user_id::text, ''),
        coalesce(p_actor_attendee_id::text, ''),
        p_action,
        p_payload::text
      ),
      'UTF8'
    ),
    'sha256'
  );
$$;

-- ===== Ajout d'un événement =====
-- Seul point d'entrée en écriture. Appelé par les RPC (SECURITY DEFINER) dans leur
-- propre transaction : l'événement est commité avec l'action qu'il décrit, ou pas du tout.
create function private.audit(
  p_org_id uuid,
  p_assembly_id uuid,
  p_action text,
  p_payload jsonb default '{}',
  p_actor_attendee_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chain uuid := coalesce(p_assembly_id, p_org_id);
  v_head public.audit_heads;
  v_at timestamptz := clock_timestamp();
  v_seq bigint;
  v_hash bytea;
begin
  insert into public.audit_heads (chain_id, seq, hash)
  values (v_chain, 0, '\x'::bytea)
  on conflict (chain_id) do nothing;

  -- Verrou de la tête de chaîne : sérialise les ajouts d'une même chaîne.
  select * into strict v_head from public.audit_heads where chain_id = v_chain for update;

  v_seq := v_head.seq + 1;
  v_hash := private.audit_hash(
    v_head.hash, v_chain, p_org_id, p_assembly_id, v_seq, v_at,
    auth.uid(), p_actor_attendee_id, p_action, coalesce(p_payload, '{}')
  );

  insert into public.audit_log (
    chain_id, org_id, assembly_id, seq, at, actor_user_id, actor_attendee_id,
    action, payload, prev_hash, hash
  ) values (
    v_chain, p_org_id, p_assembly_id, v_seq, v_at, auth.uid(), p_actor_attendee_id,
    p_action, coalesce(p_payload, '{}'), v_head.hash, v_hash
  );

  update public.audit_heads set seq = v_seq, hash = v_hash where chain_id = v_chain;
  return v_seq;
end;
$$;

-- ===== Protection en ajout seul =====
create function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'append_only',
    detail = format('%s interdit sur %s.%s', tg_op, tg_table_schema, tg_table_name);
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.forbid_mutation();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.forbid_mutation();

-- La tête de chaîne ne peut qu'avancer d'un cran, vers une ligne existante du journal.
create function private.guard_audit_head()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'append_only',
      detail = 'DELETE interdit sur public.audit_heads';
  end if;
  if new.chain_id <> old.chain_id
     or new.seq <> old.seq + 1
     or not exists (
       select 1 from public.audit_log l
       where l.chain_id = new.chain_id and l.seq = new.seq and l.hash = new.hash
     ) then
    raise exception using errcode = 'P0001', message = 'audit_head_invalid_move';
  end if;
  return new;
end;
$$;

create trigger audit_heads_guard
  before update or delete on public.audit_heads
  for each row execute function private.guard_audit_head();
create trigger audit_heads_no_truncate
  before truncate on public.audit_heads
  for each statement execute function private.forbid_mutation();

-- ===== Vérification de la chaîne =====
-- Recalcule chaque hash depuis les champs stockés, vérifie le chaînage, la continuité
-- des numéros et la tête de chaîne. Renvoie le premier défaut rencontré.
create function private.verify_audit_chain_unchecked(p_chain_id uuid)
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
    v_prev := v_row.hash;
    v_expected_seq := v_expected_seq + 1;
  end loop;

  select * into v_head from public.audit_heads where chain_id = p_chain_id;
  if coalesce(v_head.seq, 0) <> v_expected_seq - 1 or coalesce(v_head.hash, '\x'::bytea) <> v_prev then
    return jsonb_build_object('ok', false, 'count', v_expected_seq - 1,
      'broken_at_seq', v_expected_seq, 'reason', 'head_mismatch');
  end if;

  return jsonb_build_object('ok', true, 'count', v_expected_seq - 1,
    'last_hash', encode(v_prev, 'hex'));
end;
$$;

-- Point d'entrée RPC : réservé aux administrateurs de l'organisation propriétaire
-- de la chaîne (et au super-admin).
create function public.verify_audit_chain(p_chain_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.audit_log where chain_id = p_chain_id limit 1;
  if v_org is null then
    if not private.is_platform_admin() then
      perform private.fail('forbidden');
    end if;
  elsif not private.has_org_role(v_org, array['org_admin']::public.org_role[]) then
    perform private.fail('forbidden');
  end if;
  return private.verify_audit_chain_unchecked(p_chain_id);
end;
$$;
grant execute on function public.verify_audit_chain(uuid) to authenticated, service_role;

-- ===== Lecture =====
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.audit_heads enable row level security;
alter table public.audit_heads force row level security;

create policy audit_log_select on public.audit_log for select to authenticated
  using (private.has_org_role(org_id, array['org_admin']::public.org_role[]));

grant select on public.audit_log to authenticated, service_role;
-- audit_heads : aucun accès applicatif. Pas d'INSERT/UPDATE/DELETE pour personne,
-- service_role compris : seules les fonctions SECURITY DEFINER écrivent.
