-- Exports : droits (préparation et bureau seulement), données de la feuille de présence et des
-- résultats, enregistrement du document déposé (empreinte, audit, journal en ajout seul).
begin;
select plan(17);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),   -- organisatrice
  ('00000000-0000-0000-0000-0000000000a5', 'a5@org-a.test', false),   -- accueil (hors org)
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test', false);
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
select public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null,
  array[(select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'A')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Maître Tiers', null, null, null, false);
select public.grant_proxy(pg_temp.ag(), (select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'B'),
  (select id from public.attendees where assembly_id = pg_temp.ag() and full_name = 'Maître Tiers'), 'named');
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
reset role;
insert into storage.objects (bucket_id, name, metadata)
values ('signatures', pg_temp.ag() || '/' || (select id from public.attendees where full_name = 'Alice' and assembly_id = pg_temp.ag()) || '/s.png', '{"size": 10}');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_in(pg_temp.ag(), (select id from public.attendees where assembly_id = pg_temp.ag() and full_name = 'Alice'),
  null, pg_temp.ag() || '/' || (select id from public.attendees where full_name = 'Alice' and assembly_id = pg_temp.ag()) || '/s.png');
select public.check_in(pg_temp.ag(), (select id from public.attendees where assembly_id = pg_temp.ag() and full_name = 'Maître Tiers'));
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a2', 'president');
reset role;
insert into public.assembly_staff (assembly_id, user_id, role) values (pg_temp.ag(), '00000000-0000-0000-0000-0000000000a5', 'reception');

-- ----- Feuille de présence -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.att', public.export_attendance_data(pg_temp.ag())::text, true);
select is(jsonb_array_length(current_setting('test.att')::jsonb -> 'members'), 2, 'un membre par ligne');
select is((select m -> 'attendee' ->> 'signature_path' from jsonb_array_elements(current_setting('test.att')::jsonb -> 'members') m
           where m ->> 'ref' = 'A') like '%/s.png', true, 'signature de la personne émargée');
select is((select m ->> 'holder' from jsonb_array_elements(current_setting('test.att')::jsonb -> 'members') m
           where m ->> 'ref' = 'B'), 'Maître Tiers', 'membre représenté : son mandataire');
select is(current_setting('test.att')::jsonb -> 'others' -> 0 ->> 'name', 'Maître Tiers', 'mandataire tiers émargé');
select is((current_setting('test.att')::jsonb -> 'others' -> 0 ->> 'proxies')::int, 1, 'avec ses pouvoirs');
select is(current_setting('test.att')::jsonb -> 'bureau' -> 0 ->> 'role', 'president', 'bureau pour la certification');
select is(jsonb_array_length(current_setting('test.att')::jsonb -> 'quorum'), 1, 'récapitulatif par clé');
select is(public.export_results_data(pg_temp.ag()) -> 'resolutions', '[]'::jsonb, 'résultats : ordre du jour vide');
reset role;

-- ----- Droits -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select throws_ok($$ select public.export_attendance_data(pg_temp.ag()) $$, 'P0001', 'not_found',
  'l''accueil n''exporte pas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.export_results_data(pg_temp.ag()) $$, 'P0001', 'not_found',
  'une autre organisation n''exporte pas');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('exports', %L, '{"size": 10}') $$,
  pg_temp.ag() || '/x.pdf'), '42501', null, 'ni ne dépose dans ses exports');
reset role;

-- ----- Enregistrement -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.record_export(%L, 'attendance', 'pdf', %L, %L, 100) $$, pg_temp.ag(),
  pg_temp.ag() || '/absent.pdf', repeat('a', 64)), 'P0001', 'invalid_document', 'document non déposé refusé');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('exports', %L, '{"size": 100}') $$,
  pg_temp.ag() || '/doc.pdf'), 'dépôt dans le dossier de l''AG');
select set_config('test.export', public.record_export(pg_temp.ag(), 'attendance', 'pdf', pg_temp.ag() || '/doc.pdf',
  repeat('A', 64), 100)::text, true);
select is((select sha256 from public.exports where id = current_setting('test.export')::uuid), repeat('a', 64),
  'empreinte enregistrée');
select throws_ok(format($$ select public.record_export(%L, 'attendance', 'pdf', %L, 'xyz', 100) $$, pg_temp.ag(),
  pg_temp.ag() || '/doc.pdf'), '23514', null, 'empreinte mal formée refusée');
reset role;
select is((select payload ->> 'sha256' from public.audit_log where chain_id = pg_temp.ag() and action = 'export.generated'),
  repeat('a', 64), 'export consigné au journal d''audit');
select throws_ok($$ delete from public.exports $$, 'P0001', 'append_only', 'journal des exports en ajout seul');

select * from finish();
rollback;
