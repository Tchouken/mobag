-- 0002 — Organisations, rôles, profils, helpers de droits et RLS associée.

-- ===== Profils (miroir minimal de auth.users, pour l'affichage des équipes) =====
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email extensions.citext,
  full_name text,
  created_at timestamptz not null default now()
);

-- Les votants (sessions anonymes) n'ont pas de profil : ils sont identifiés par
-- leur jeton de vote (T8), pas par un compte.
create function private.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

create trigger on_auth_user_sync_profile
  after insert or update of email, raw_user_meta_data, is_anonymous on auth.users
  for each row execute function private.sync_profile();

-- ===== Organisations =====
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  slug extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  branding jsonb not null default '{}',
  retention_days int check (retention_days is null or retention_days > 0),
  created_by uuid references public.profiles,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  email extensions.citext not null,
  role public.org_role not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles,
  revoked_at timestamptz
);
create index org_invitations_org_idx on public.org_invitations (org_id);
-- Une seule invitation en attente par adresse et par organisation.
create unique index org_invitations_pending_uniq on public.org_invitations (org_id, email)
  where accepted_at is null and revoked_at is null;

-- ===== Helpers de droits =====
-- STABLE + SECURITY DEFINER : utilisables dans les politiques RLS sans récursion.

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Vrai si l'utilisateur courant a l'un des rôles demandés dans l'organisation
-- (n'importe quel rôle si p_roles est null). Le super-admin a tous les droits.
create function private.has_org_role(p_org uuid, p_roles public.org_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin()
      or exists (
        select 1
        from public.org_members m
        where m.org_id = p_org
          and m.user_id = auth.uid()
          and (p_roles is null or m.role = any (p_roles))
      );
$$;

-- Vrai si deux utilisateurs partagent au moins une organisation.
create function private.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members mine
    join public.org_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated, service_role;
grant execute on function private.shares_org_with(uuid) to authenticated, service_role;

-- ===== RLS : lecture seule, écritures via RPC uniquement =====
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
alter table public.org_members enable row level security;
alter table public.org_members force row level security;
alter table public.org_invitations enable row level security;
alter table public.org_invitations force row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_platform_admin() or private.shares_org_with(id));

create policy organizations_select on public.organizations for select to authenticated
  using (private.has_org_role(id));

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or private.is_platform_admin());

create policy org_members_select on public.org_members for select to authenticated
  using (private.has_org_role(org_id));

create policy org_invitations_select on public.org_invitations for select to authenticated
  using (private.has_org_role(org_id, array['org_admin']::public.org_role[]));

grant select on public.profiles, public.organizations, public.platform_admins, public.org_members
  to authenticated, service_role;
-- Le hash du jeton d'invitation n'est jamais lisible.
grant select (id, org_id, email, role, expires_at, created_by, created_at, accepted_at, accepted_by, revoked_at)
  on public.org_invitations to authenticated, service_role;
