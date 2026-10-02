-- État de la plateforme : agrégats publics pour le gel des déploiements.
begin;
select plan(4);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test');
insert into public.organizations (id, name, slug) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a');
insert into public.org_members (org_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'organizer');
select set_config('test.before', public.platform_status()::text, true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG', 'ago', 'association', '',
  (now() at time zone 'Europe/Paris' + interval '2 hours')::timestamp)::text, true);
select public.import_members(current_setting('test.ag')::uuid, '[{"external_ref": "A", "last_name": "A", "weights": {"voix": 1}}]', 'append', false);
select public.set_assembly_status(current_setting('test.ag')::uuid, 'convened', null);
set local role anon;
select is((public.platform_status() ->> 'starting_soon')::int,
  (current_setting('test.before')::jsonb ->> 'starting_soon')::int + 1, 'AG convoquée pour aujourd''hui : gel');
reset role;
select public.set_assembly_status(current_setting('test.ag')::uuid, 'in_session', null);
set local role anon;
select is((public.platform_status() ->> 'in_session')::int,
  (current_setting('test.before')::jsonb ->> 'in_session')::int + 1, 'AG en séance comptée');
select is((select count(*)::int from jsonb_object_keys(public.platform_status())), 3, 'agrégats seulement');
select throws_ok($$ select 1 from public.assemblies $$, '42501', null, 'l''anonyme ne lit pas les AG');
reset role;
select * from finish();
rollback;
