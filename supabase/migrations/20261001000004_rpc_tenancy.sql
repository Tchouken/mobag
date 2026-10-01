-- 0004 — RPC d'administration des organisations : création, invitations, rôles.
-- Chaque action est auditée dans la chaîne de l'organisation.

-- ===== Création d'organisation (super-admin) =====
create function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    perform private.fail('forbidden');
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    perform private.fail('invalid_slug');
  end if;
  if exists (select 1 from public.organizations where slug = p_slug::extensions.citext) then
    perform private.fail('slug_taken');
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), p_slug, auth.uid())
  returning id into v_id;

  perform private.audit(v_id, null, 'org.created', jsonb_build_object('name', trim(p_name), 'slug', p_slug));
  return v_id;
end;
$$;

-- ===== Invitations =====
create function public.invite_org_member(
  p_org uuid,
  p_email text,
  p_role public.org_role,
  p_ttl_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(trim(p_email));
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
  v_expires timestamptz := now() + make_interval(days => p_ttl_days);
begin
  if not private.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    perform private.fail('forbidden');
  end if;
  if v_email is null or v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform private.fail('invalid_email');
  end if;
  if p_ttl_days is null or p_ttl_days not between 1 and 30 then
    perform private.fail('invalid_ttl');
  end if;
  if exists (
    select 1 from public.org_members m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and p.email = v_email
  ) then
    perform private.fail('already_member');
  end if;
  if exists (
    select 1 from public.org_invitations
    where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null
      and expires_at > now()
  ) then
    perform private.fail('invitation_pending');
  end if;

  -- Une invitation expirée non acceptée est close pour libérer l'index d'unicité.
  update public.org_invitations set revoked_at = now()
  where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.org_invitations (org_id, email, role, token_hash, expires_at, created_by)
  values (p_org, v_email, p_role, extensions.digest(v_token, 'sha256'), v_expires, auth.uid())
  returning id into v_id;

  perform private.audit(p_org, null, 'org.invitation_created',
    jsonb_build_object('invitation_id', v_id, 'email', v_email, 'role', p_role, 'expires_at', v_expires));

  -- Le jeton en clair n'est renvoyé qu'ici, une seule fois.
  return jsonb_build_object('invitation_id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create function public.revoke_org_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.org_invitations;
begin
  select * into v_inv from public.org_invitations where id = p_invitation for update;
  if not found or not private.has_org_role(v_inv.org_id, array['org_admin']::public.org_role[]) then
    perform private.fail('not_found');
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    perform private.fail('invitation_closed');
  end if;

  update public.org_invitations set revoked_at = now() where id = p_invitation;
  perform private.audit(v_inv.org_id, null, 'org.invitation_revoked',
    jsonb_build_object('invitation_id', p_invitation, 'email', v_inv.email));
end;
$$;

-- Lecture d'une invitation par son jeton (page d'acceptation). Ne révèle que le
-- nécessaire, et seulement à un utilisateur connecté.
create function public.get_org_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.org_invitations;
  v_org_name text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_inv from public.org_invitations
  where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256');
  if not found then
    return null;
  end if;
  select name into v_org_name from public.organizations where id = v_inv.org_id;

  return jsonb_build_object(
    'org_id', v_inv.org_id,
    'org_name', v_org_name,
    'email', v_inv.email,
    'role', v_inv.role,
    'status', case
      when v_inv.accepted_at is not null then 'accepted'
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.expires_at <= now() then 'expired'
      else 'pending'
    end
  );
end;
$$;

create function public.accept_org_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.org_invitations;
  v_email extensions.citext;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    perform private.fail('forbidden');
  end if;

  select * into v_inv from public.org_invitations
  where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
  for update;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    perform private.fail('invitation_closed');
  end if;
  if v_inv.expires_at <= now() then
    perform private.fail('invitation_expired');
  end if;
  if v_inv.email <> v_email then
    perform private.fail('invitation_email_mismatch');
  end if;
  if exists (select 1 from public.org_members where org_id = v_inv.org_id and user_id = auth.uid()) then
    perform private.fail('already_member');
  end if;

  insert into public.org_members (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role);
  update public.org_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;

  perform private.audit(v_inv.org_id, null, 'org.member_joined',
    jsonb_build_object('invitation_id', v_inv.id, 'user_id', auth.uid(), 'role', v_inv.role));
  return v_inv.org_id;
end;
$$;

-- ===== Rôles =====
-- Garde-fou : une organisation garde toujours au moins un administrateur.
create function private.assert_keeps_an_admin(p_org uuid, p_user_leaving_admin uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.org_members
    where org_id = p_org and role = 'org_admin' and user_id <> p_user_leaving_admin
  ) then
    perform private.fail('last_org_admin');
  end if;
end;
$$;

create function public.set_org_member_role(p_org uuid, p_user uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.org_role;
begin
  if not private.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    perform private.fail('forbidden');
  end if;
  -- Verrouille les membres de l'organisation : deux rétrogradations simultanées
  -- ne peuvent pas retirer le dernier administrateur.
  perform 1 from public.org_members where org_id = p_org for update;
  select role into v_current from public.org_members where org_id = p_org and user_id = p_user;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_current = p_role then
    return;
  end if;
  if v_current = 'org_admin' then
    perform private.assert_keeps_an_admin(p_org, p_user);
  end if;

  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
  perform private.audit(p_org, null, 'org.member_role_changed',
    jsonb_build_object('user_id', p_user, 'from', v_current, 'to', p_role));
end;
$$;

-- Un administrateur retire un membre ; tout membre peut se retirer lui-même.
create function public.remove_org_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.org_role;
begin
  if not (p_user = auth.uid() or private.has_org_role(p_org, array['org_admin']::public.org_role[])) then
    perform private.fail('forbidden');
  end if;
  perform 1 from public.org_members where org_id = p_org for update;
  select role into v_current from public.org_members where org_id = p_org and user_id = p_user;
  if not found then
    perform private.fail('not_found');
  end if;
  if v_current = 'org_admin' then
    perform private.assert_keeps_an_admin(p_org, p_user);
  end if;

  delete from public.org_members where org_id = p_org and user_id = p_user;
  perform private.audit(p_org, null, 'org.member_removed',
    jsonb_build_object('user_id', p_user, 'role', v_current));
end;
$$;

grant execute on function
  public.create_organization(text, text),
  public.invite_org_member(uuid, text, public.org_role, int),
  public.revoke_org_invitation(uuid),
  public.get_org_invitation(text),
  public.accept_org_invitation(text),
  public.set_org_member_role(uuid, uuid, public.org_role),
  public.remove_org_member(uuid, uuid)
to authenticated;
