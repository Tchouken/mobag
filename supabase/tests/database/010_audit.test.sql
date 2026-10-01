-- Journal d'audit : chaînage, ajout seul, détection d'altération, droits.
begin;
select plan(21);

-- ----- Fixtures -----
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@org-a.test'),
  ('22222222-2222-2222-2222-222222222222', 'orga@org-a.test'),
  ('33333333-3333-3333-3333-333333333333', 'autre@org-b.test');
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'org_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'organizer'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'org_admin');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ----- Chaînage -----
select is(private.audit('aaaaaaaa-0000-0000-0000-000000000000', null, 'test.first', '{"n": 1}'), 1::bigint,
  'premier événement : seq 1');
select is(private.audit('aaaaaaaa-0000-0000-0000-000000000000', null, 'test.second', '{"n": 2}'), 2::bigint,
  'deuxième événement : seq 2');
select is(private.audit('aaaaaaaa-0000-0000-0000-000000000000', null, 'test.third', '{"b": [1, 2], "a": "x"}'),
  3::bigint, 'troisième événement : seq 3');
select is(private.audit('bbbbbbbb-0000-0000-0000-000000000000', null, 'test.other', '{}'), 1::bigint,
  'une autre organisation a sa propre chaîne');

select is(
  (select prev_hash from public.audit_log where chain_id = 'aaaaaaaa-0000-0000-0000-000000000000' and seq = 2),
  (select hash from public.audit_log where chain_id = 'aaaaaaaa-0000-0000-0000-000000000000' and seq = 1),
  'chaque ligne porte le hash de la précédente');

select is(private.verify_audit_chain_unchecked('aaaaaaaa-0000-0000-0000-000000000000') ->> 'ok', 'true',
  'chaîne intacte vérifiée');
select is((private.verify_audit_chain_unchecked('aaaaaaaa-0000-0000-0000-000000000000') ->> 'count')::int, 3,
  'la vérification compte 3 événements');

select throws_ok($$ select private.audit('aaaaaaaa-0000-0000-0000-000000000000', null, 'Pas Valide', '{}') $$,
  '23514', null, 'les noms d''action sont normalisés (domaine.action)');

-- ----- Ajout seul (même pour le propriétaire des tables) -----
select throws_ok($$ update public.audit_log set payload = '{}' where seq = 1 $$,
  'P0001', 'append_only', 'UPDATE interdit sur audit_log');
select throws_ok($$ delete from public.audit_log where seq = 1 $$,
  'P0001', 'append_only', 'DELETE interdit sur audit_log');
select throws_ok($$ truncate public.audit_log $$,
  'P0001', 'append_only', 'TRUNCATE interdit sur audit_log');
select throws_ok($$ update public.audit_heads set seq = 10 where chain_id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  'P0001', 'audit_head_invalid_move', 'la tête de chaîne ne peut pas sauter');
select throws_ok($$ delete from public.audit_heads $$,
  'P0001', 'append_only', 'DELETE interdit sur audit_heads');

-- ----- Détection d'altération (triggers désactivés pour simuler un accès direct) -----
savepoint tamper;
alter table public.audit_log disable trigger audit_log_no_update_delete;
update public.audit_log set payload = '{"n": 99}'
  where chain_id = 'aaaaaaaa-0000-0000-0000-000000000000' and seq = 2;
select is(private.verify_audit_chain_unchecked('aaaaaaaa-0000-0000-0000-000000000000'),
  '{"ok": false, "count": 1, "reason": "hash_mismatch", "broken_at_seq": 2}'::jsonb,
  'une modification de contenu est détectée');
rollback to savepoint tamper;

savepoint tamper;
alter table public.audit_log disable trigger audit_log_no_update_delete;
delete from public.audit_log where chain_id = 'aaaaaaaa-0000-0000-0000-000000000000' and seq = 3;
select is(private.verify_audit_chain_unchecked('aaaaaaaa-0000-0000-0000-000000000000') ->> 'reason', 'head_mismatch',
  'la suppression du dernier événement est détectée');
rollback to savepoint tamper;

savepoint tamper;
alter table public.audit_log disable trigger audit_log_no_update_delete;
delete from public.audit_log where chain_id = 'aaaaaaaa-0000-0000-0000-000000000000' and seq = 2;
select is(private.verify_audit_chain_unchecked('aaaaaaaa-0000-0000-0000-000000000000') ->> 'reason',
  'missing_or_reordered_entry', 'la suppression d''un événement intermédiaire est détectée');
rollback to savepoint tamper;

-- ----- Droits applicatifs -----
set local role service_role;
select throws_ok($$ insert into public.audit_log (chain_id, org_id, seq, at, action, prev_hash, hash)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 4, now(), 'x.y', '\x', '\x') $$,
  '42501', null, 'service_role ne peut pas écrire dans audit_log');
reset role;

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select private.audit('aaaaaaaa-0000-0000-0000-000000000000', null, 'x.y', '{}') $$,
  '42501', null, 'un utilisateur ne peut pas appeler private.audit');
select is_empty($$ select 1 from public.audit_log $$,
  'un organisateur (non admin) ne lit pas le journal');
select throws_ok($$ select public.verify_audit_chain('aaaaaaaa-0000-0000-0000-000000000000') $$,
  'P0001', 'forbidden', 'un organisateur ne peut pas lancer la vérification');
reset role;

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select results_eq($$ select count(*)::int from public.audit_log $$, array[3],
  'l''admin de l''org A ne voit que la chaîne de son organisation');
reset role;

select * from finish();
rollback;
