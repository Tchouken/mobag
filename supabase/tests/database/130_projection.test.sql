-- Écran de projection : lien à jeton (émission, rotation, révocation, droits), état public
-- (agrégats seulement, résultat publié une fois validé), accès anonyme.
begin;
select plan(18);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@org-a.test', false),
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
create function pg_temp.state() returns jsonb language sql as $$
  select public.projection_state(current_setting('test.token')) $$;
grant execute on function pg_temp.ag() to authenticated;
grant execute on function pg_temp.ag(), pg_temp.state() to anon;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG annuelle', 'ago',
  'association', '', '2026-06-15 18:00')::text, true);
select public.update_assembly_rules(pg_temp.ag(), 1,
  '{"conditions": [{"measure": "heads", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 2, "comparison": "gte"}]}',
  '{"max_count": null, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
  '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}');
select public.import_members(pg_temp.ag(), $$[
  {"external_ref": "A", "last_name": "Alpha", "weights": {"voix": 3}},
  {"external_ref": "B", "last_name": "Bravo", "weights": {"voix": 2}}
]$$, 'append', false);
select set_config('test.r1', public.upsert_resolution(pg_temp.ag(), null, jsonb_build_object(
  'title', 'Comptes', 'parent_id', null, 'body', '{"type": "doc", "content": []}'::jsonb,
  'weight_key_id', (select id from public.weight_keys where assembly_id = pg_temp.ag() and is_primary),
  'vote_type', 'yes_no_abstain',
  'majority_rule', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}'::jsonb,
  'abstention_policy', 'excluded', 'quorum_rule', null, 'is_secret', true))::text, true);
select public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null,
  array[(select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'A')], false);
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a3', 'president');

-- ----- Lien -----
select throws_ok($$ select public.rotate_projection_token(pg_temp.ag()) $$, 'P0001', 'assembly_locked',
  'pas de projection d''un brouillon');
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
select set_config('test.token', public.rotate_projection_token(pg_temp.ag()), true);
select ok(current_setting('test.token') ~ '^[0-9A-HJKMNP-TV-Z]{24}$', 'jeton de 24 caractères');
select throws_ok($$ select 1 from public.projection_links $$, '42501', null, 'l''empreinte n''est lisible par personne');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.rotate_projection_token(pg_temp.ag()) $$, 'P0001', 'not_found',
  'une autre organisation n''émet pas de lien');
reset role;

-- ----- État public, sans session -----
set local role anon;
select is(pg_temp.state() -> 'assembly' ->> 'title', 'AG annuelle', 'l''écran anonyme lit l''AG');
select is(public.projection_state('ZZZZZZZZZZZZZZZZZZZZZZZZ'), null, 'jeton inconnu : rien');
select is((pg_temp.state() -> 'quorum' ->> 'reached')::boolean, false, 'quorum non atteint');
select is(pg_temp.state() -> 'current', 'null'::jsonb, 'aucun vote en cours');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_in(pg_temp.ag(), (select id from public.attendees where assembly_id = pg_temp.ag()));
select set_config('test.code', public.issue_voter_token((select id from public.attendees where assembly_id = pg_temp.ag()),
  'personal') ->> 'code', true);
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select set_config('test.b1', public.open_ballot(current_setting('test.r1')::uuid, 120) ->> 'ballot_id', true);
reset role;
select set_config('test.member', (select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'A')::text, true);
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.claim_voter_token(current_setting('test.code'));
select public.cast_votes(current_setting('test.b1')::uuid, jsonb_build_array(jsonb_build_object(
  'member_id', current_setting('test.member'), 'choice', 'for')), gen_random_uuid());
select throws_ok($$ select public.rotate_projection_token(pg_temp.ag()) $$, 'P0001', 'not_found',
  'un appareil votant n''émet pas de lien');
reset role;

set local role anon;
select is((pg_temp.state() -> 'quorum' ->> 'reached')::boolean, true, 'quorum atteint après l''émargement');
select is(pg_temp.state() -> 'current' ->> 'title', 'Comptes', 'résolution en cours');
select is((pg_temp.state() -> 'current' -> 'voted' ->> 'heads')::int, 1, 'participation');
select is(pg_temp.state() -> 'current' ? 'tallies', false, 'aucune tendance pendant le vote');
select ok(pg_temp.state() -> 'current' ->> 'closes_at' is not null, 'compte à rebours');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select public.close_ballot(current_setting('test.b1')::uuid);
reset role;
set local role anon;
select is(pg_temp.state() -> 'result', 'null'::jsonb, 'résultat provisoire non projeté');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select public.validate_result(current_setting('test.b1')::uuid);
select set_config('test.old', current_setting('test.token'), true);
select set_config('test.token', public.rotate_projection_token(pg_temp.ag()), true);
reset role;
set local role anon;
select is(pg_temp.state() -> 'result' ->> 'outcome', 'adopted', 'résultat validé projeté (avec le nouveau lien)');
select is(public.projection_state(current_setting('test.old')), null, 'l''ancien lien ne fonctionne plus');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select public.revoke_projection_token(pg_temp.ag());
reset role;
set local role anon;
select is(pg_temp.state(), null, 'lien révoqué');
reset role;

select * from finish();
rollback;
