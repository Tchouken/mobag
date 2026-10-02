-- Émargement : signatures (dépôt, rattachement contrôlé) et instantané de l'écran d'accueil.
begin;
select plan(16);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test', false),
  ('00000000-0000-0000-0000-0000000000f1', null, true);
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'org_admin');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.ag() returns uuid language sql as $$ select current_setting('test.ag')::uuid $$;
grant execute on function pg_temp.ag() to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG', 'ago', 'association',
  '', '2026-06-15 18:00')::text, true);
select public.import_members(pg_temp.ag(), $$[
  {"external_ref": "A", "last_name": "Alpha", "weights": {"voix": 3}},
  {"external_ref": "B", "last_name": "Bravo", "weights": {"voix": 2}}
]$$, 'append', false);
select set_config('test.alice', public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null,
  array[(select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'A')], false)::text, true);
select set_config('test.tiers', public.upsert_attendee(pg_temp.ag(), null, 'Tiers', null, null, null, false)::text, true);
select public.grant_proxy(pg_temp.ag(), (select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'B'),
  current_setting('test.tiers')::uuid, 'named');
select set_config('test.sig', pg_temp.ag()::text || '/' || current_setting('test.alice') || '/s.png', true);

-- ----- Signatures -----
select throws_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('signatures', %L, '{"size": 10}') $$,
  current_setting('test.sig')), '42501', null, 'pas de signature avant la convocation');
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
select lives_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('signatures', %L, '{"size": 10}') $$,
  current_setting('test.sig')), 'signature déposée dans le dossier de la personne');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('signatures', %L, '{"size": 10}') $$,
  pg_temp.ag()::text || '/' || gen_random_uuid() || '/s.png'), '42501', null, 'dossier d''une personne inconnue refusé');
select throws_ok(format($$ select public.check_in(%L, %L, null, %L) $$, pg_temp.ag(), current_setting('test.tiers'),
  current_setting('test.sig')), 'P0001', 'invalid_signature', 'la signature d''une personne ne sert pas pour une autre');
select throws_ok(format($$ select public.check_in(%L, %L, null, %L) $$, pg_temp.ag(), current_setting('test.alice'),
  pg_temp.ag()::text || '/' || current_setting('test.alice') || '/absente.png'), 'P0001', 'invalid_signature',
  'signature non déposée refusée');
select lives_ok(format($$ select public.check_in(%L, %L, null, %L) $$, pg_temp.ag(), current_setting('test.alice'),
  current_setting('test.sig')), 'émargement signé');
reset role;
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
delete from storage.objects where bucket_id = 'signatures';
select is((select count(*)::int from storage.objects where bucket_id = 'signatures'), 1, 'une signature ne se supprime pas');

-- ----- Instantané -----
select set_config('test.snap', public.reception_snapshot(pg_temp.ag())::text, true);
select is(jsonb_array_length(current_setting('test.snap')::jsonb -> 'members'), 2, 'instantané : membres');
select is((select m ->> 'presence' from jsonb_array_elements(current_setting('test.snap')::jsonb -> 'members') m
           where m ->> 'ref' = 'A'), 'present', 'instantané : présence');
select is((select m -> 'proxy' ->> 'holder_attendee_id' from jsonb_array_elements(current_setting('test.snap')::jsonb -> 'members') m
           where m ->> 'ref' = 'B'), current_setting('test.tiers'), 'instantané : pouvoir vivant du mandant');
select is((select a ->> 'has_signature' from jsonb_array_elements(current_setting('test.snap')::jsonb -> 'attendees') a
           where a ->> 'full_name' = 'Alice'), 'true', 'instantané : signature présente');
select is((select a -> 'proxy_member_ids' from jsonb_array_elements(current_setting('test.snap')::jsonb -> 'attendees') a
           where a ->> 'full_name' = 'Tiers'), jsonb_build_array((select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'B')),
  'instantané : pouvoirs détenus');
select public.issue_voter_token(current_setting('test.alice')::uuid, 'loaned', 'Tablette 7');
select is((select a -> 'device' from jsonb_array_elements(public.reception_snapshot(pg_temp.ag()) -> 'attendees') a
           where a ->> 'full_name' = 'Alice'), '{"kind": "loaned", "label": "Tablette 7", "claimed": false}'::jsonb,
  'instantané : appareil de vote (sans le code)');
select is((public.reception_snapshot(pg_temp.ag()) -> 'quorum' -> 'counts' -> 'present' ->> 'weight')::numeric, 3.0,
  'instantané : quorum');
reset role;

-- ----- Droits -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.reception_snapshot(pg_temp.ag()) $$, 'P0001', 'not_found', 'autre organisation : refusé');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$ select public.reception_snapshot(pg_temp.ag()) $$, 'P0001', 'not_found', 'appareil votant : refusé');
reset role;

select * from finish();
rollback;
