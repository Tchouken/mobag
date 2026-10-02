-- Identité des votants : émission, association d'appareil, réassociation de tablette,
-- révocation, expiration, contexte du votant, absence d'accès aux tables, isolation, audit.
begin;
select plan(31);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test', false),
  ('00000000-0000-0000-0000-0000000000f1', null, true),   -- smartphone d'Alice
  ('00000000-0000-0000-0000-0000000000f2', null, true),   -- tablette prêtée
  ('00000000-0000-0000-0000-0000000000f3', null, true);   -- appareil d'un tiers
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
create function pg_temp.att(p_name text) returns uuid language sql as $$
  select id from public.attendees where assembly_id = pg_temp.ag() and full_name = p_name $$;
grant execute on function pg_temp.ag(), pg_temp.att(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG', 'ago', 'association',
  '', '2026-06-15 18:00')::text, true);
select public.import_members(pg_temp.ag(), $$[
  {"external_ref": "A", "last_name": "Alpha", "first_name": "Alice", "weights": {"voix": 3}},
  {"external_ref": "B", "last_name": "Bravo", "first_name": "Bruno", "weights": {"voix": 2}}
]$$, 'append', false);
select public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null,
  array[(select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'A')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Bruno', null, null,
  array[(select id from public.members where assembly_id = pg_temp.ag() and external_ref = 'B')], false);
select public.set_assembly_status(pg_temp.ag(), 'convened', null);

-- ----- Émission -----
select throws_ok($$ select public.issue_voter_token(pg_temp.att('Alice'), 'personal') $$,
  'P0001', 'attendee_not_present', 'pas de code de vote avant l''émargement');
select public.check_in(pg_temp.ag(), pg_temp.att('Alice'));
select public.check_in(pg_temp.ag(), pg_temp.att('Bruno'));
select set_config('test.code1', public.issue_voter_token(pg_temp.att('Alice'), 'personal') ->> 'code', true);
select ok(current_setting('test.code1') ~ '^[0-9A-HJKMNP-TV-Z]{16}$', 'code de 16 caractères Crockford');
select set_config('test.code2', public.issue_voter_token(pg_temp.att('Alice'), 'personal') ->> 'code', true);
select is((select count(*)::int from public.voter_tokens where attendee_id = pg_temp.att('Alice') and revoked_at is null), 1,
  'réémettre révoque le code précédent');
select throws_ok($$ select public.issue_voter_token(pg_temp.att('Alice'), 'watch') $$,
  'P0001', 'invalid_token_kind', 'type d''appareil inconnu refusé');
select set_config('test.codeB', public.issue_voter_token(pg_temp.att('Bruno'), 'loaned', 'Tablette 3') ->> 'code', true);
select throws_ok($$ select token_hash from public.voter_tokens $$, '42501', null, 'l''empreinte des codes n''est pas lisible');
reset role;
select isnt((select token_hash from public.voter_tokens where attendee_id = pg_temp.att('Alice') and revoked_at is null),
  convert_to(current_setting('test.code2'), 'UTF8'), 'seule l''empreinte du code est conservée');

-- ----- Association d'appareil -----
-- Identifiant mémorisé : sous la session du votant, la RLS masque la table attendees.
select set_config('test.alice', pg_temp.att('Alice')::text, true);
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select is(public.my_voter_context(), null, 'appareil non associé : aucun contexte');
select throws_ok(format($$ select public.claim_voter_token(%L) $$, current_setting('test.code1')),
  'P0001', 'invalid_token', 'un code révoqué est refusé');
select throws_ok($$ select public.claim_voter_token('ZZZZZZZZZZZZZZZZ') $$, 'P0001', 'invalid_token', 'code inconnu refusé');
-- Saisie tolérante : minuscules, tirets, O pour 0, I ou L pour 1.
select is(public.claim_voter_token(
  lower(regexp_replace(translate(current_setting('test.code2'), '01', 'OI'), '(.{4})', '\1-', 'g'))) ->> 'attendee_id',
  current_setting('test.alice'), 'saisie tolérante (minuscules, tirets, O/0, I/1)');
select is(public.claim_voter_token(current_setting('test.code2')) ->> 'attendee_id', current_setting('test.alice'),
  'association idempotente pour le même appareil');
select is(public.my_voter_context() -> 'attendee' ->> 'full_name', 'Alice', 'contexte : la personne');
select is((public.my_voter_context() -> 'portfolio' -> 'totals' -> 0 ->> 'weight')::numeric, 3.0, 'contexte : ses voix');
select is(private.current_attendee_id(pg_temp.ag())::text, current_setting('test.alice'), 'l''appareil agit au nom d''Alice');

-- Un votant ne lit aucune table.
select is_empty($$ select 1 from public.members union all select 1 from public.attendees union all select 1 from public.proxies
  union all select 1 from public.member_presence union all select 1 from public.voter_tokens $$,
  'un appareil votant ne lit aucune table');
select throws_ok($$ select public.current_quorum(pg_temp.ag()) $$, 'P0001', 'not_found', 'ni le quorum du personnel');
select throws_ok($$ select public.issue_voter_token(pg_temp.att('Bruno'), 'personal') $$, 'P0001', 'not_found',
  'un votant n''émet pas de code');
reset role;

-- Un code déjà associé ne sert pas sur un autre appareil (code photographié).
select pg_temp.login('00000000-0000-0000-0000-0000000000f3');
select throws_ok(format($$ select public.claim_voter_token(%L) $$, current_setting('test.code2')),
  'P0001', 'token_already_claimed', 'code déjà associé à un autre appareil');
reset role;

-- ----- Tablette prêtée qui change de mains -----
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select lives_ok(format($$ select public.claim_voter_token(%L) $$, current_setting('test.codeB')), 'la tablette 3 est associée à Bruno');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.codeA', public.issue_voter_token(pg_temp.att('Alice'), 'loaned', 'Tablette 3') ->> 'code', true);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select lives_ok(format($$ select public.claim_voter_token(%L) $$, current_setting('test.codeA')), 'la tablette passe à Alice');
select is(public.my_voter_context() -> 'attendee' ->> 'full_name', 'Alice', 'la tablette agit désormais au nom d''Alice');
reset role;
select is((select revoked_reason from public.voter_tokens where attendee_id = pg_temp.att('Bruno')), 'device_reassigned',
  'l''association de Bruno est retirée');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select is(public.my_voter_context(), null, 'réémettre pour Alice a retiré l''association de son smartphone');
reset role;

-- ----- Révocation, libération, expiration, clôture -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select public.revoke_voter_token(pg_temp.att('Alice'), 'returned') $$, 'tablette rendue');
select throws_ok($$ select public.revoke_voter_token(pg_temp.att('Alice')) $$, 'P0001', 'no_active_token',
  'rien à révoquer');
select set_config('test.codeC', public.issue_voter_token(pg_temp.att('Bruno'), 'personal') ->> 'code', true);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f3');
select public.claim_voter_token(current_setting('test.codeC'));
select lives_ok($$ select public.release_voter_device() $$, '« Ce n''est pas moi » : l''appareil se libère');
select is(public.my_voter_context(), null, 'appareil libéré');
reset role;

update public.voter_tokens set revoked_at = null, revoked_reason = null, expires_at = now() - interval '1 second'
where attendee_id = pg_temp.att('Bruno') and revoked_reason = 'returned';
select pg_temp.login('00000000-0000-0000-0000-0000000000f3');
select is(public.my_voter_context(), null, 'code expiré : plus de contexte');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.codeD', public.issue_voter_token(pg_temp.att('Bruno'), 'personal') ->> 'code', true);
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);
select public.set_assembly_status(pg_temp.ag(), 'closed', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f3');
select throws_ok(format($$ select public.claim_voter_token(%L) $$, current_setting('test.codeD')),
  'P0001', 'invalid_token', 'AG close : les codes ne valent plus');
reset role;

-- ----- Isolation et audit -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.issue_voter_token(pg_temp.att('Bruno'), 'personal') $$, 'P0001', 'not_found',
  'une autre organisation n''émet pas de code');
reset role;
select is(private.verify_audit_chain_unchecked(pg_temp.ag()) ->> 'ok', 'true', 'chaîne d''audit intègre');

select * from finish();
rollback;
