-- Organisations : isolation RLS entre organisations, droits des RPC, invitations, rôles.
begin;
select plan(48);

-- ----- Fixtures -----
-- P : super-admin · A1 : admin org A · A2 : organisateur org A · B1 : admin org B
-- N : compte sans organisation · V : session anonyme (votant)
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a0', 'p@mobilactif.test', false),
  ('00000000-0000-0000-0000-0000000000a1', 'a1@org-a.test', false),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test', false),
  ('00000000-0000-0000-0000-0000000000ff', 'n@nowhere.test', false),
  ('00000000-0000-0000-0000-0000000000cc', null, true);
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a0');
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'org_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'org_admin');
insert into public.org_invitations (org_id, email, role, token_hash, expires_at, created_by) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'x@org-b.test', 'organizer',
   extensions.digest('jeton-b', 'sha256'), now() + interval '1 day', '00000000-0000-0000-0000-0000000000b1');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ----- Profils -----
select is((select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-0000000000%'), 5,
  'un profil par compte, aucun pour la session anonyme');

-- ----- Isolation : organisateur de l'org A -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select results_eq($$ select slug::text from public.organizations $$, array['org-a'],
  'A2 ne voit que son organisation');
select results_eq($$ select count(*)::int from public.org_members $$, array[2],
  'A2 ne voit que les membres de l''org A');
select results_eq($$ select email::text from public.profiles order by email $$,
  array['a1@org-a.test', 'a2@org-a.test'], 'A2 ne voit que les profils de son organisation');
select is_empty($$ select 1 from public.org_invitations $$, 'un organisateur ne voit pas les invitations');
select is_empty($$ select 1 from public.platform_admins $$, 'A2 ne voit pas la liste des super-admins');
reset role;

-- ----- Isolation : admin de l'org B -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select results_eq($$ select slug::text from public.organizations $$, array['org-b'],
  'B1 ne voit que son organisation');
select is_empty($$ select 1 from public.org_members where org_id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  'B1 ne voit aucun membre de l''org A');
select is_empty($$ select 1 from public.profiles where email::text like '%org-a%' $$,
  'B1 ne voit aucun profil de l''org A');
select results_eq($$ select email::text from public.org_invitations $$, array['x@org-b.test'],
  'B1 voit les invitations de son organisation');
select throws_ok($$ select token_hash from public.org_invitations $$, '42501', null,
  'le hash du jeton d''invitation n''est pas lisible');
reset role;

-- ----- Isolation : compte sans organisation, session anonyme, rôle anon -----
select pg_temp.login('00000000-0000-0000-0000-0000000000ff');
select is_empty($$ select 1 from public.organizations $$, 'N ne voit aucune organisation');
select results_eq($$ select count(*)::int from public.profiles $$, array[1], 'N ne voit que son profil');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000cc');
select is_empty($$ select 1 from public.organizations union all select 1 from public.org_members $$,
  'une session anonyme ne voit rien');
reset role;

set local role anon;
select throws_ok($$ select * from public.organizations $$, '42501', null, 'anon n''a aucun accès aux tables');
select throws_ok($$ select public.create_organization('x', 'x') $$, '42501', null,
  'anon ne peut appeler aucune RPC d''administration');
reset role;

-- ----- Super-admin -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a0');
select results_eq($$ select count(*)::int from public.organizations
    where id in ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000') $$, array[2],
  'le super-admin voit toutes les organisations');
reset role;

-- ----- Écritures directes interdites -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ insert into public.organizations (name, slug) values ('X', 'x') $$, '42501', null,
  'pas d''INSERT direct sur organizations');
select throws_ok($$ update public.org_members set role = 'org_admin' $$, '42501', null,
  'pas d''UPDATE direct sur org_members');
select throws_ok($$ delete from public.org_invitations $$, '42501', null,
  'pas de DELETE direct sur org_invitations');
reset role;

-- ----- create_organization -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.create_organization('Org C', 'org-c') $$, 'P0001', 'forbidden',
  'seul le super-admin crée une organisation');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a0');
select throws_ok($$ select public.create_organization('Org C', 'Org C') $$, 'P0001', 'invalid_slug',
  'slug invalide refusé');
select throws_ok($$ select public.create_organization('Org A bis', 'org-a') $$, 'P0001', 'slug_taken',
  'slug déjà pris refusé');
select isnt(public.create_organization('Org C', 'org-c'), null, 'le super-admin crée une organisation');
reset role;
select is((select action from public.audit_log a join public.organizations o on o.id = a.org_id
           where o.slug = 'org-c'), 'org.created', 'la création est auditée');

-- ----- Invitations -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.invite_org_member('aaaaaaaa-0000-0000-0000-000000000000', 'new@org-a.test', 'organizer') $$,
  'P0001', 'forbidden', 'un organisateur ne peut pas inviter');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.invite_org_member('aaaaaaaa-0000-0000-0000-000000000000', 'new@org-a.test', 'organizer') $$,
  'P0001', 'forbidden', 'l''admin d''une autre organisation ne peut pas inviter');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select ok(set_config('test.inv',
  public.invite_org_member('aaaaaaaa-0000-0000-0000-000000000000', ' New@Org-A.test ', 'organizer')::text,
  true)::jsonb ->> 'token' ~ '^[0-9a-f]{64}$', 'l''admin invite et reçoit un jeton de 256 bits');
select ok(set_config('test.token', current_setting('test.inv')::jsonb ->> 'token', true) is not null,
  'jeton conservé pour la suite');
select throws_ok($$ select public.invite_org_member('aaaaaaaa-0000-0000-0000-000000000000', 'new@org-a.test', 'org_admin') $$,
  'P0001', 'invitation_pending', 'pas de seconde invitation en attente pour la même adresse');
select throws_ok($$ select public.invite_org_member('aaaaaaaa-0000-0000-0000-000000000000', 'a2@org-a.test', 'organizer') $$,
  'P0001', 'already_member', 'on n''invite pas un membre existant');
select throws_ok($$ select public.invite_org_member('aaaaaaaa-0000-0000-0000-000000000000', 'pas-un-email', 'organizer') $$,
  'P0001', 'invalid_email', 'adresse invalide refusée');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.revoke_org_invitation((current_setting('test.inv')::jsonb ->> 'invitation_id')::uuid) $$,
  'P0001', 'not_found', 'l''admin d''une autre organisation ne peut pas révoquer l''invitation');
reset role;

-- Acceptation par un compte dont l'e-mail ne correspond pas
select pg_temp.login('00000000-0000-0000-0000-0000000000ff');
select is(public.get_org_invitation(current_setting('test.token')) ->> 'status', 'pending',
  'l''invitation est consultable par son jeton');
select throws_ok($$ select public.accept_org_invitation(current_setting('test.token')) $$,
  'P0001', 'invitation_email_mismatch', 'un autre compte ne peut pas accepter l''invitation');
select is(public.get_org_invitation('jeton-inconnu'), null, 'jeton inconnu : rien n''est révélé');
reset role;

-- Acceptation par le bon compte
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'new@org-a.test');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select is(public.accept_org_invitation(current_setting('test.token')), 'aaaaaaaa-0000-0000-0000-000000000000'::uuid,
  'l''invité accepte et rejoint l''organisation');
select results_eq($$ select role::text from public.org_members where user_id = auth.uid() $$, array['organizer'],
  'le rôle de l''invitation est appliqué');
select throws_ok($$ select public.accept_org_invitation(current_setting('test.token')) $$,
  'P0001', 'invitation_closed', 'une invitation ne s''utilise qu''une fois');
reset role;

-- Invitation expirée
update public.org_invitations set expires_at = now() - interval '1 minute' where email = 'x@org-b.test';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e2', 'x@org-b.test');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok($$ select public.accept_org_invitation('jeton-b') $$,
  'P0001', 'invitation_expired', 'une invitation expirée est refusée');
reset role;

-- ----- Rôles -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.set_org_member_role('aaaaaaaa-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1', 'organizer') $$,
  'P0001', 'last_org_admin', 'le dernier administrateur ne peut pas se rétrograder');
select throws_ok($$ select public.remove_org_member('aaaaaaaa-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'last_org_admin', 'le dernier administrateur ne peut pas partir');
select lives_ok($$ select public.set_org_member_role('aaaaaaaa-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a2', 'org_admin') $$, 'l''admin promeut un organisateur');
select lives_ok($$ select public.set_org_member_role('aaaaaaaa-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1', 'organizer') $$, 'puis se rétrograde, un autre admin existant');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.remove_org_member('aaaaaaaa-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'forbidden', 'un admin d''une autre organisation ne retire personne');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.remove_org_member('aaaaaaaa-0000-0000-0000-000000000000', auth.uid()) $$,
  'un membre peut quitter l''organisation');
reset role;

-- ----- Audit -----
select is(private.verify_audit_chain_unchecked('aaaaaaaa-0000-0000-0000-000000000000') ->> 'ok', 'true',
  'la chaîne d''audit de l''org A reste intègre');
select results_eq($$ select action from public.audit_log where org_id = 'aaaaaaaa-0000-0000-0000-000000000000' order by seq $$,
  array['org.invitation_created', 'org.member_joined', 'org.member_role_changed', 'org.member_role_changed',
        'org.member_removed'],
  'chaque action d''administration est tracée dans l''ordre');

select * from finish();
rollback;
