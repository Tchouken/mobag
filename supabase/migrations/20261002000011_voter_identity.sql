-- 0011 — Identité des votants (SPEC §5.8, §7.3 ; DECISIONS Q3).
--
-- Un code de vote par personne présente : 16 caractères Crockford base32 (80 bits), lisible et
-- saisissable, encodé aussi en QR. Seul son empreinte SHA-256 est conservée. Le code est
-- « réclamé » par un appareil (session Supabase anonyme sur le smartphone du votant ou une
-- tablette prêtée) ; l'appareil vote ensuite au nom de cette personne.
--   · une personne n'a qu'un code actif (réémettre révoque le précédent) ;
--   · un appareil ne représente qu'une personne par AG (une tablette prêtée qui change de
--     mains révoque l'association précédente) ;
--   · un code déjà réclamé par un autre appareil est refusé (code photographié ou transmis).
-- Les votants n'ont aucun accès aux tables : leurs lectures passent par des RPC dédiées.

create table public.voter_tokens (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  attendee_id uuid not null,
  token_hash bytea not null unique,
  kind text not null check (kind in ('personal', 'loaned')),
  device_label text check (length(device_label) <= 50),
  expires_at timestamptz not null,
  claimed_by uuid references auth.users on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('reissued', 'device_reassigned', 'returned', 'manual')),
  issued_by uuid,
  issued_at timestamptz not null default clock_timestamp(),
  foreign key (attendee_id, assembly_id) references public.attendees (id, assembly_id) on delete cascade
);
create unique index voter_tokens_one_active_per_attendee on public.voter_tokens (attendee_id) where revoked_at is null;
create index voter_tokens_device_idx on public.voter_tokens (claimed_by) where revoked_at is null;

alter table public.voter_tokens enable row level security;
alter table public.voter_tokens force row level security;
-- Le personnel voit les associations (sans l'empreinte) ; les votants rien.
create policy voter_tokens_select on public.voter_tokens for select to authenticated
  using (private.can_read_assembly(assembly_id));
grant select (id, assembly_id, attendee_id, kind, device_label, expires_at, claimed_at, revoked_at, revoked_reason,
              issued_at) on public.voter_tokens to authenticated, service_role;

-- ===== Helpers =====

-- Code aléatoire en alphabet Crockford (32 symboles : chaque octet & 31 est uniforme).
create function private.random_code(p_length int)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(b, i) & 31) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(p_length) as b) r, generate_series(0, p_length - 1) i;
$$;

-- Saisie tolérante : majuscules, séparateurs retirés, confusions usuelles corrigées (O→0, I/L→1).
create function private.normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(regexp_replace(upper(coalesce(p_code, '')), '[^0-9A-Z]', '', 'g'), 'OIL', '011');
$$;

-- Association active de l'appareil courant (session Supabase) : la plus récente, non révoquée,
-- non expirée, dans une AG ni close ni archivée.
create function private.current_voter_token()
returns public.voter_tokens
language sql
stable
security definer
set search_path = ''
as $$
  select t.* from public.voter_tokens t
  join public.assemblies a on a.id = t.assembly_id
  where t.claimed_by = auth.uid() and t.revoked_at is null and t.expires_at > now()
    and a.status in ('convened', 'in_session')
  order by t.claimed_at desc
  limit 1;
$$;

-- Personne au nom de laquelle l'appareil courant agit dans une AG (null sinon).
create function private.current_attendee_id(p_assembly uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select attendee_id from private.current_voter_token() where assembly_id = p_assembly;
$$;
grant execute on function private.current_attendee_id(uuid) to authenticated, service_role;

-- ===== RPC : personnel =====

-- Émet le code de vote d'une personne présente. Renvoie le code en clair, une seule fois.
create function public.issue_voter_token(p_attendee uuid, p_kind text, p_device_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendee public.attendees;
  v_assembly public.assemblies;
  v_code text := private.random_code(16);
  v_expires timestamptz;
begin
  select * into v_attendee from public.attendees where id = p_attendee;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_operation(v_attendee.assembly_id,
    array['convened', 'in_session']::public.assembly_status[]);
  if p_kind is null or p_kind not in ('personal', 'loaned') then
    perform private.fail('invalid_token_kind');
  end if;
  if v_attendee.status <> 'present' then
    perform private.fail('attendee_not_present');
  end if;

  update public.voter_tokens set revoked_at = clock_timestamp(), revoked_reason = 'reissued'
  where attendee_id = p_attendee and revoked_at is null;

  -- Durée de vie limitée à l'AG : le jour de séance et la nuit suivante (la clôture
  -- invalide de toute façon les codes).
  v_expires := greatest(v_assembly.starts_at, now()) + interval '36 hours';
  insert into public.voter_tokens (assembly_id, attendee_id, token_hash, kind, device_label, expires_at, issued_by)
  values (v_attendee.assembly_id, p_attendee, extensions.digest(v_code, 'sha256'), p_kind,
          nullif(trim(p_device_label), ''), v_expires, auth.uid());

  perform private.audit(v_assembly.org_id, v_attendee.assembly_id, 'voter_token.issued', jsonb_build_object(
    'attendee_id', p_attendee, 'kind', p_kind, 'device_label', nullif(trim(p_device_label), '')));
  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'kind', p_kind);
end;
$$;

-- Retire l'association d'une personne (tablette rendue, appareil perdu).
create function public.revoke_voter_token(p_attendee uuid, p_reason text default 'manual')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendee public.attendees;
  v_assembly public.assemblies;
begin
  select * into v_attendee from public.attendees where id = p_attendee;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_operation(v_attendee.assembly_id,
    array['convened', 'in_session', 'closed']::public.assembly_status[]);
  if coalesce(p_reason, 'manual') not in ('returned', 'manual') then
    perform private.fail('invalid_reason');
  end if;
  update public.voter_tokens set revoked_at = clock_timestamp(), revoked_reason = coalesce(p_reason, 'manual')
  where attendee_id = p_attendee and revoked_at is null;
  if not found then
    perform private.fail('no_active_token');
  end if;
  perform private.audit(v_assembly.org_id, v_attendee.assembly_id, 'voter_token.revoked',
    jsonb_build_object('attendee_id', p_attendee, 'reason', coalesce(p_reason, 'manual')));
end;
$$;

-- ===== RPC : appareil du votant =====

-- Associe l'appareil courant (session anonyme ou non) au code saisi ou scanné.
create function public.claim_voter_token(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.voter_tokens;
  v_assembly public.assemblies;
begin
  if auth.uid() is null then
    perform private.fail('not_authenticated');
  end if;
  select * into v_token from public.voter_tokens
  where token_hash = extensions.digest(private.normalize_code(p_code), 'sha256')
  for update;
  if not found or v_token.revoked_at is not null or v_token.expires_at <= now() then
    perform private.fail('invalid_token');
  end if;
  select * into v_assembly from public.assemblies where id = v_token.assembly_id;
  if v_assembly.status not in ('convened', 'in_session') then
    perform private.fail('invalid_token');
  end if;
  if v_token.claimed_by is not null and v_token.claimed_by <> auth.uid() then
    perform private.fail('token_already_claimed');
  end if;

  if v_token.claimed_by is null then
    -- L'appareil représentait quelqu'un d'autre dans cette AG (tablette prêtée) : association retirée.
    update public.voter_tokens set revoked_at = clock_timestamp(), revoked_reason = 'device_reassigned'
    where claimed_by = auth.uid() and assembly_id = v_token.assembly_id and revoked_at is null and id <> v_token.id;
    update public.voter_tokens set claimed_by = auth.uid(), claimed_at = clock_timestamp() where id = v_token.id;
    perform private.audit(v_assembly.org_id, v_token.assembly_id, 'voter_token.claimed',
      jsonb_build_object('attendee_id', v_token.attendee_id, 'kind', v_token.kind), v_token.attendee_id);
  end if;

  return jsonb_build_object('assembly_id', v_token.assembly_id, 'attendee_id', v_token.attendee_id);
end;
$$;

-- Contexte du votant pour l'appareil courant : AG, personne, voix portées. null si l'appareil
-- n'est associé à personne.
create function public.my_voter_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token public.voter_tokens := private.current_voter_token();
  v_assembly public.assemblies;
  v_attendee public.attendees;
begin
  if v_token.id is null then
    return null;
  end if;
  select * into v_assembly from public.assemblies where id = v_token.assembly_id;
  select * into v_attendee from public.attendees where id = v_token.attendee_id;
  return jsonb_build_object(
    'assembly', jsonb_build_object('id', v_assembly.id, 'title', v_assembly.title, 'status', v_assembly.status,
                                   'starts_at', v_assembly.starts_at, 'timezone', v_assembly.timezone),
    'attendee', jsonb_build_object('id', v_attendee.id, 'full_name', v_attendee.full_name, 'status', v_attendee.status),
    'device', jsonb_build_object('kind', v_token.kind, 'label', v_token.device_label),
    'portfolio', private.attendee_portfolio(v_attendee.id));
end;
$$;

-- L'appareil quitte volontairement son association (« Ce n'est pas moi », fin d'usage).
create function public.release_voter_device()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.voter_tokens := private.current_voter_token();
  v_org uuid;
begin
  if v_token.id is null then
    return;
  end if;
  update public.voter_tokens set revoked_at = clock_timestamp(), revoked_reason = 'returned' where id = v_token.id;
  select org_id into v_org from public.assemblies where id = v_token.assembly_id;
  perform private.audit(v_org, v_token.assembly_id, 'voter_token.released',
    jsonb_build_object('attendee_id', v_token.attendee_id), v_token.attendee_id);
end;
$$;

grant execute on function
  public.issue_voter_token(uuid, text, text),
  public.revoke_voter_token(uuid, text),
  public.claim_voter_token(text),
  public.my_voter_context(),
  public.release_voter_device()
to authenticated;
