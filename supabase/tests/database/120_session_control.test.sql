-- Pilotage de séance : verrous 5.9 (RPC et seconde barrière), corrections du bureau tracées,
-- minuteur, relance, instantané de la régie, présence des terminaux.
begin;
select plan(30);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),   -- organisatrice
  ('00000000-0000-0000-0000-0000000000a3', 'a3@org-a.test', false),   -- présidente
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test', false),
  ('00000000-0000-0000-0000-0000000000f1', null, true);
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'organizer'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'org_admin');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.ag() returns uuid language sql as $$ select current_setting('test.ag')::uuid $$;
create function pg_temp.m(p_ref text) returns uuid language sql as $$
  select id from public.members where assembly_id = pg_temp.ag() and external_ref = p_ref $$;
create function pg_temp.key() returns uuid language sql as $$
  select id from public.weight_keys where assembly_id = pg_temp.ag() and is_primary $$;
create function pg_temp.r(p_n text) returns uuid language sql as $$ select current_setting('test.r' || p_n)::uuid $$;
create function pg_temp.res(p_title text) returns jsonb language sql as $$
  select jsonb_build_object('title', p_title, 'parent_id', null, 'body', '{"type": "doc", "content": []}'::jsonb,
    'weight_key_id', pg_temp.key(), 'vote_type', 'yes_no_abstain',
    'majority_rule', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}'::jsonb,
    'abstention_policy', 'excluded', 'quorum_rule', null, 'is_secret', false) $$;
grant execute on function pg_temp.ag(), pg_temp.m(text), pg_temp.key(), pg_temp.r(text), pg_temp.res(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG', 'ago', 'association',
  '', '2026-06-15 18:00')::text, true);
select public.import_members(pg_temp.ag(), $$[
  {"external_ref": "A", "last_name": "Alpha", "weights": {"voix": 3}},
  {"external_ref": "B", "last_name": "Bravo", "weights": {"voix": 2}}
]$$, 'append', false);
select set_config('test.r1', public.upsert_resolution(pg_temp.ag(), null, pg_temp.res('Comptes'))::text, true);
select set_config('test.r2', public.upsert_resolution(pg_temp.ag(), null, pg_temp.res('Budget'))::text, true);
select public.upsert_weight_key(pg_temp.ag(), null, 'ascenseur', 'Ascenseur', null, false);
select public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null, array[pg_temp.m('A')], false);
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a3', 'president');
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
select public.check_in(pg_temp.ag(), (select id from public.attendees where assembly_id = pg_temp.ag()));
select set_config('test.code', public.issue_voter_token((select id from public.attendees where assembly_id = pg_temp.ag()),
  'personal') ->> 'code', true);
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);

-- ----- Verrous en séance -----
select throws_ok($$ select public.upsert_member(pg_temp.ag(), pg_temp.m('B'), '{"external_ref": "B", "last_name": "Bravo", "weights": {"voix": 9}}') $$,
  'P0001', 'assembly_locked', 'préparation : membres non modifiables en séance');
select throws_ok($$ select public.upsert_resolution(pg_temp.ag(), pg_temp.r('2'), pg_temp.res('Autre'), null, 'motif') $$,
  'P0001', 'assembly_locked', 'préparation : résolutions non modifiables en séance');
reset role;
select throws_ok($$ update public.member_weights set weight = 9 where member_id = pg_temp.m('B') $$,
  'P0001', 'assembly_locked', 'seconde barrière : même hors RPC, les poids sont figés');
select throws_ok($$ update public.resolutions set title = 'X' where id = pg_temp.r('2') $$,
  'P0001', 'assembly_locked', 'seconde barrière : résolutions');
select throws_ok($$ delete from public.weight_keys where code = 'ascenseur' and assembly_id = pg_temp.ag() $$,
  'P0001', 'assembly_locked', 'seconde barrière : clés de répartition');
select throws_ok($$ insert into public.members (assembly_id, kind, display_name) values (pg_temp.ag(), 'person', 'Intrus') $$,
  'P0001', 'assembly_locked', 'seconde barrière : pas de nouveau membre');

-- ----- Corrections du bureau -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.bureau_set_member_weight(pg_temp.m('B'), pg_temp.key(), 4, 'Erreur d''import') $$,
  'P0001', 'forbidden', 'l''organisatrice hors bureau ne corrige pas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select set_config('test.b1', public.open_ballot(pg_temp.r('1')) ->> 'ballot_id', true);
select throws_ok($$ select public.bureau_set_member_weight(pg_temp.m('A'), pg_temp.key(), 4, ' ') $$,
  'P0001', 'bureau_reason_required', 'motif obligatoire');
select throws_ok($$ select public.bureau_set_member_weight(pg_temp.m('A'), pg_temp.key(), -1, 'x') $$,
  'P0001', 'invalid_weight', 'poids négatif refusé');
select lives_ok($$ select public.bureau_set_member_weight(pg_temp.m('A'), pg_temp.key(), 4, 'Erreur d''import') $$,
  'le bureau corrige un poids, avec motif');
select is((public.current_quorum(pg_temp.ag()) -> 'counts' -> 'present' ->> 'weight')::numeric, 4.0,
  'le quorum en tient compte');
select is((select (totals -> 'present_represented' ->> 'weight')::numeric from public.ballots where id = current_setting('test.b1')::uuid),
  3.0, 'le scrutin ouvert garde sa base figée');
select throws_ok($$ select public.bureau_amend_resolution(pg_temp.r('1'), pg_temp.res('Comptes 2025'), null, 'Coquille') $$,
  'P0001', 'resolution_voted', 'une résolution mise au vote ne change plus');
select throws_ok($$ select public.bureau_amend_resolution(pg_temp.r('2'), pg_temp.res('Budget'), null, '') $$,
  'P0001', 'bureau_reason_required', 'amendement : motif obligatoire');
select throws_ok($$ select public.bureau_amend_resolution(pg_temp.r('2'), pg_temp.res('Budget') || jsonb_build_object('parent_id', pg_temp.r('1')), null, 'x') $$,
  'P0001', 'invalid_parent', 'pas de réorganisation de l''ordre du jour en séance');
select lives_ok($$ select public.bureau_amend_resolution(pg_temp.r('2'), pg_temp.res('Budget 2027 amendé'), null, 'Amendement adopté en séance') $$,
  'résolution non votée amendée par le bureau');
reset role;
select is((select title from public.resolutions where id = pg_temp.r('2')), 'Budget 2027 amendé', 'amendement appliqué');
select is((select reason from public.resolution_versions where resolution_id = pg_temp.r('2') order by version desc limit 1),
  'Amendement adopté en séance', 'amendement versionné avec son motif');
select is((select string_agg(action, ',' order by seq) from public.audit_log where chain_id = pg_temp.ag() and action like 'bureau.%'),
  'bureau.weight_corrected,bureau.resolution_amended', 'corrections du bureau tracées');
select is(current_setting('mobag.bureau_override', true), '', 'la levée du verrou ne survit pas à l''appel');

-- ----- Minuteur et relance -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.set_ballot_timer(current_setting('test.b1')::uuid, 5) $$, 'P0001', 'invalid_duration',
  'minuteur trop court');
select ok(public.set_ballot_timer(current_setting('test.b1')::uuid, 60) > now(), 'minuteur posé en cours de scrutin');
select is(public.set_ballot_timer(current_setting('test.b1')::uuid, null), null, 'minuteur retiré');
select is(public.remind_voters(current_setting('test.b1')::uuid), 1, 'relance : une personne n''a pas encore voté');

-- ----- Instantané de la régie -----
select is(jsonb_array_length(public.regie_snapshot(pg_temp.ag()) -> 'quorum'), 2, 'quorum par clé de répartition');
select is(public.regie_snapshot(pg_temp.ag()) -> 'resolutions' -> 0 -> 'ballots' -> 0 -> 'tallies', 'null'::jsonb,
  'aucune tendance tant que le vote est ouvert');
select is((public.regie_snapshot(pg_temp.ag()) -> 'open_ballot' -> 'eligible' ->> 'heads')::int, 1, 'participation du scrutin ouvert');
select public.close_ballot(current_setting('test.b1')::uuid);
select is(public.regie_snapshot(pg_temp.ag()) -> 'resolutions' -> 0 -> 'ballots' -> 0 ->> 'outcome', 'rejected',
  'résultat provisoire visible après clôture');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.regie_snapshot(pg_temp.ag()) $$, 'P0001', 'not_found', 'autre organisation : refusé');
reset role;

-- ----- Présence des terminaux -----
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.claim_voter_token(current_setting('test.code'));
select ok(private.can_track_presence('assembly:' || pg_temp.ag() || ':voters'), 'un appareil associé signale sa présence');
reset role;

select * from finish();
rollback;
