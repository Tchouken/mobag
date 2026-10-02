-- Moteur de scrutin : ouverture (droits, base figée, quorum), vote idempotent et tout ou rien,
-- modification, départ pendant un scrutin (5.6.4, B2), clôture scellée, résultat, validation,
-- minuteur, annulation, pouvoirs en blanc selon l'avis du conseil (B7), secret des votes.
begin;
select plan(67);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),   -- organisatrice (hors bureau)
  ('00000000-0000-0000-0000-0000000000a3', 'a3@org-a.test', false),   -- présidente de séance
  ('00000000-0000-0000-0000-0000000000a4', 'a4@org-a.test', false),   -- scrutateur
  ('00000000-0000-0000-0000-0000000000f1', null, true),               -- appareil d'Alice
  ('00000000-0000-0000-0000-0000000000f2', null, true),               -- appareil de Bruno
  ('00000000-0000-0000-0000-0000000000f3', null, true);               -- appareil de Claire
insert into public.organizations (id, name, slug) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'organizer'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', 'organizer');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.ag() returns uuid language sql as $$ select current_setting('test.ag')::uuid $$;
create function pg_temp.m(p_ref text) returns uuid language sql as $$
  select id from public.members where assembly_id = pg_temp.ag() and external_ref = p_ref $$;
create function pg_temp.att(p_name text) returns uuid language sql as $$
  select id from public.attendees where assembly_id = pg_temp.ag() and full_name = p_name $$;
create function pg_temp.b(p_name text) returns uuid language sql as $$ select current_setting('test.' || p_name)::uuid $$;
create function pg_temp.items(variadic p text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('member_id', current_setting('test.m' || p[i]), 'choice', p[i + 1]))
  from generate_series(1, array_length(p, 1), 2) i $$;
create function pg_temp.res(p_title text, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', p_title, 'parent_id', null, 'body', '{"type": "doc", "content": []}'::jsonb,
    'weight_key_id', (select id from public.weight_keys where assembly_id = pg_temp.ag() and is_primary),
    'vote_type', 'yes_no_abstain',
    'majority_rule', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}'::jsonb,
    'abstention_policy', 'excluded', 'quorum_rule', null, 'is_secret', true) || p_extra $$;
grant execute on function pg_temp.ag(), pg_temp.m(text), pg_temp.att(text), pg_temp.b(text), pg_temp.items(text[]),
  pg_temp.res(text, jsonb) to authenticated;

-- ----- Préparation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG', 'ago', 'association',
  '', '2026-06-15 18:00')::text, true);
select public.update_assembly_rules(pg_temp.ag(), 1, null,
  '{"max_count": null, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
  '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}');
select public.import_members(pg_temp.ag(), $$[
  {"external_ref": "A", "last_name": "Alpha", "weights": {"voix": 3}},
  {"external_ref": "B", "last_name": "Bravo", "weights": {"voix": 2}},
  {"external_ref": "C", "last_name": "Charlie", "weights": {"voix": 5}},
  {"external_ref": "D", "last_name": "Delta", "weights": {"voix": 1}},
  {"external_ref": "E", "last_name": "Echo", "weights": {"voix": 4}}
]$$, 'append', false);
select set_config('test.m' || r, pg_temp.m(r)::text, true) from unnest(array['A', 'B', 'C', 'D', 'E']) r;
select set_config('test.r1', public.upsert_resolution(pg_temp.ag(), null, pg_temp.res('Comptes'))::text, true);
select set_config('test.r2', public.upsert_resolution(pg_temp.ag(), null, pg_temp.res('Statuts', '{"allow_vote_change": false,
  "quorum_rule": {"conditions": [{"measure": "heads", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 1, "comparison": "gte"}]}}'))::text, true);
select set_config('test.r3', public.upsert_resolution(pg_temp.ag(), null,
  pg_temp.res('Information', '{"vote_type": "information"}'))::text, true);
select set_config('test.r4', public.upsert_resolution(pg_temp.ag(), null,
  pg_temp.res('Budget', '{"abstention_policy": "included"}'))::text, true);
select public.upsert_attendee(pg_temp.ag(), null, n, null, null, array[pg_temp.m(r)], false)
from (values ('Alice', 'A'), ('Bruno', 'B'), ('Claire', 'C')) v(n, r);
select public.grant_proxy(pg_temp.ag(), pg_temp.m('D'), pg_temp.att('Alice'), 'named');
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a3', 'president');
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a4', 'scrutineer');
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
select public.check_in(pg_temp.ag(), pg_temp.att('Alice'));
select public.check_in(pg_temp.ag(), pg_temp.att('Bruno'));
select set_config('test.code_' || n, public.issue_voter_token(pg_temp.att(n), 'personal') ->> 'code', true)
from unnest(array['Alice', 'Bruno']) n;

-- ----- Ouverture -----
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.open_ballot(current_setting('test.r1')::uuid) $$, 'P0001', 'assembly_locked',
  'pas de scrutin avant l''ouverture de la séance');
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.open_ballot(current_setting('test.r1')::uuid) $$, 'P0001', 'forbidden',
  'l''organisatrice hors bureau n''ouvre pas de scrutin');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.open_ballot(current_setting('test.r3')::uuid) $$, 'P0001', 'vote_type_not_available',
  'une résolution d''information ne se vote pas');
select throws_ok($$ select public.open_ballot(current_setting('test.r1')::uuid, 5) $$, 'P0001', 'invalid_duration',
  'minuteur trop court refusé');
select set_config('test.b1', public.open_ballot(current_setting('test.r1')::uuid) ->> 'ballot_id', true);
select is((select totals -> 'present_represented' from public.ballots where id = pg_temp.b('b1')),
  '{"weight": 6.000000, "heads": 3}'::jsonb, 'base figée : présents et représentés (Alice, Delta, Bruno)');
select is((select totals -> 'all_members' from public.ballots where id = pg_temp.b('b1')),
  '{"weight": 15.000000, "heads": 5}'::jsonb, 'base figée : tous les membres');
select is((select (totals -> 'quorum' ->> 'reached')::boolean from public.ballots where id = pg_temp.b('b1')), true,
  'sans règle de quorum : atteint');
select throws_ok($$ select public.open_ballot(current_setting('test.r1')::uuid) $$, 'P0001', 'ballot_exists',
  'un seul scrutin vivant par résolution');
select throws_ok($$ select public.open_ballot(current_setting('test.r2')::uuid) $$, 'P0001', 'ballot_already_open',
  'un seul scrutin ouvert à la fois');
reset role;

-- Retardataire : Claire arrive après l'ouverture.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_in(pg_temp.ag(), pg_temp.att('Claire'));
select set_config('test.code_Claire', public.issue_voter_token(pg_temp.att('Claire'), 'personal') ->> 'code', true);
reset role;
select is((select count(*)::int from public.ballot_eligibility where ballot_id = pg_temp.b('b1')), 3,
  'le retardataire n''entre pas dans la base figée');

-- ----- Vote -----
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.claim_voter_token(current_setting('test.code_Alice'));
select is(jsonb_array_length(public.my_ballots() -> 0 -> 'members'), 2, 'Alice voit ses voix et le pouvoir de Delta');
select is(public.my_ballots() -> 0 -> 'resolution' ->> 'title', 'Comptes', 'Alice voit la résolution');
select is(public.my_voter_context() -> 'ballots', public.my_ballots(), 'le contexte de l''appareil inclut les scrutins ouverts');
select set_config('test.first', public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'against', 'D', 'against'),
  'cccccccc-0000-0000-0000-000000000001')::text, true);
select is(current_setting('test.first')::jsonb ->> 'count', '2', 'vote pour soi et pour son mandant en un envoi');
select is(public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'for', 'D', 'for'),
  'cccccccc-0000-0000-0000-000000000001'), current_setting('test.first')::jsonb,
  'réessai avec la même clé : même réponse, rien de rejoué');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('B', 'for'), gen_random_uuid()) $$,
  'P0001', 'member_not_held', 'on ne vote pas pour un membre qu''on ne porte pas');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'peut-être'), gen_random_uuid()) $$,
  'P0001', 'invalid_choice', 'choix inconnu refusé');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'for', 'A', 'against'), gen_random_uuid()) $$,
  'P0001', 'invalid_choice', 'un membre deux fois dans le même envoi refusé');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'for', 'B', 'for'), gen_random_uuid()) $$,
  'P0001', 'member_not_held', 'tout ou rien : un membre non porté invalide l''envoi');
select is(public.my_ballots() -> 0 -> 'members' -> 0 ->> 'choice', 'against', 'l''envoi refusé n''a rien changé');
select lives_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'for'), gen_random_uuid()) $$,
  'modification du vote autorisée');
select throws_ok($$ select 1 from public.votes $$, '42501', null, 'les votes ne sont lisibles par personne');
select throws_ok($$ select 1 from public.vote_events $$, '42501', null, 'ni leur historique');
reset role;
select is((select revision from public.votes where ballot_id = pg_temp.b('b1') and member_id = pg_temp.m('A')), 2,
  'révision du vote modifié');
select is((select count(*)::int from public.vote_events where ballot_id = pg_temp.b('b1')), 3,
  'historique : deux votes et une modification (le réessai n''écrit rien)');

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select public.claim_voter_token(current_setting('test.code_Bruno'));
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('B', 'for'), 'cccccccc-0000-0000-0000-000000000001') $$,
  'P0001', 'invalid_request', 'la clé d''un autre appareil est refusée');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f3');
select public.claim_voter_token(current_setting('test.code_Claire'));
select is(public.my_ballots() -> 0 -> 'members', '[]'::jsonb, 'le retardataire ne porte aucune voix sur ce scrutin');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('C', 'for'), gen_random_uuid()) $$,
  'P0001', 'member_not_held', 'le retardataire ne vote pas');
reset role;

-- ----- Départ pendant le scrutin (5.6.4) : Bruno confie ses voix à Alice -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_out(pg_temp.att('Bruno'), 'transfer', pg_temp.att('Alice'));
reset role;
select is((select holder_attendee_id from public.ballot_eligibility where ballot_id = pg_temp.b('b1') and member_id = pg_temp.m('B')),
  pg_temp.att('Alice'), 'voix non exprimées de Bruno transmises à Alice');
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('B', 'for'), gen_random_uuid()) $$,
  'P0001', 'member_not_held', 'le partant ne vote plus pour ses voix');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select lives_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('B', 'abstain'), gen_random_uuid()) $$,
  'Alice vote les voix reçues');
reset role;

-- ----- Clôture et résultat -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select is((public.ballot_progress(pg_temp.b('b1')) -> 'voted' ->> 'heads')::int, 3, 'participation en direct');
select is(public.ballot_progress(pg_temp.b('b1')) ? 'tallies', false, 'sans tendance pendant le vote');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.close_ballot(pg_temp.b('b1')) $$, 'P0001', 'forbidden', 'clôture réservée au bureau');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select set_config('test.res1', public.close_ballot(pg_temp.b('b1'))::text, true);
select is(current_setting('test.res1')::jsonb ->> 'outcome', 'adopted', 'adoptée : 3 pour, 1 contre, abstentions exclues');
select is(current_setting('test.res1')::jsonb -> 'tallies' -> 'expressed' ->> 'weight', '4.000000', 'exprimés : 4');
select is(current_setting('test.res1')::jsonb -> 'tallies' -> 'abstain' ->> 'weight', '2.000000', 'abstentions : 2');
select is(current_setting('test.res1')::jsonb -> 'tallies' -> 'not_voted' ->> 'heads', '0', 'tout le monde a voté');
select throws_ok($$ select public.close_ballot(pg_temp.b('b1')) $$, 'P0001', 'ballot_not_open', 'déjà clos');
select throws_ok($$ select public.validate_result(pg_temp.b('b1')) $$, 'P0001', 'president_only',
  'validation réservée à la présidente');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$ select public.cast_votes(pg_temp.b('b1'), pg_temp.items('A', 'against'), gen_random_uuid()) $$,
  'P0001', 'ballot_not_open', 'aucun vote après la clôture');
select is(public.my_ballots(), '[]'::jsonb, 'plus de scrutin ouvert pour l''appareil');
reset role;
select is(private.verify_audit_chain_unchecked(pg_temp.ag()) -> 'ballots', '1'::jsonb, 'empreinte du scrutin vérifiée');
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select is(public.validate_result(pg_temp.b('b1')) ->> 'outcome', 'adopted', 'résultat validé par la présidente');
select throws_ok($$ select public.validate_result(pg_temp.b('b1')) $$, 'P0001', 'ballot_not_closed', 'déjà validé');
select throws_ok($$ select public.cancel_ballot(pg_temp.b('b1'), 'erreur') $$, 'P0001', 'ballot_not_cancellable',
  'un résultat validé ne s''annule pas');

-- ----- Vote non modifiable, quorum non atteint, minuteur -----
select set_config('test.b2', public.open_ballot(current_setting('test.r2')::uuid, 600) ->> 'ballot_id', true);
select is((select (totals -> 'quorum' ->> 'reached')::boolean from public.ballots where id = pg_temp.b('b2')), false,
  'quorum de la résolution (unanimité des têtes) non atteint');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select lives_ok($$ select public.cast_votes(pg_temp.b('b2'), pg_temp.items('A', 'for'), gen_random_uuid()) $$, 'vote');
select throws_ok($$ select public.cast_votes(pg_temp.b('b2'), pg_temp.items('A', 'against'), gen_random_uuid()) $$,
  'P0001', 'vote_already_cast', 'vote définitif sur cette résolution');
reset role;
update public.ballots set closes_at = clock_timestamp() - interval '1 second' where id = pg_temp.b('b2');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$ select public.cast_votes(pg_temp.b('b2'), pg_temp.items('D', 'for'), gen_random_uuid()) $$,
  'P0001', 'ballot_not_open', 'minuteur échu : vote refusé avant même la clôture');
reset role;
select is(private.close_expired_ballots(), 1, 'clôture automatique du scrutin échu');
select is((select outcome::text from public.results where ballot_id = pg_temp.b('b2')), 'no_quorum', 'résultat : quorum non atteint');
select is((select payload ->> 'expired' from public.audit_log where chain_id = pg_temp.ag() and action = 'ballot.closed'
           order by seq desc limit 1), 'true', 'clôture par le minuteur tracée');

-- ----- Abstentions comptées, votes acquis, départ sans transmission (B2) -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select set_config('test.b4', public.open_ballot(current_setting('test.r4')::uuid) ->> 'ballot_id', true);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.cast_votes(pg_temp.b('b4'), pg_temp.items('A', 'abstain', 'D', 'for', 'B', 'for'), gen_random_uuid());
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_out(pg_temp.att('Alice'), 'temporary', pg_temp.att('Claire'));
reset role;
select is((select holder_attendee_id from public.ballot_eligibility where ballot_id = pg_temp.b('b4') and member_id = pg_temp.m('A')),
  pg_temp.att('Alice'), 'les voix déjà exprimées ne changent pas de porteur');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_out(pg_temp.att('Claire'), 'leave');
reset role;
select is((select holder_attendee_id from public.ballot_eligibility where ballot_id = pg_temp.b('b4') and member_id = pg_temp.m('C')),
  null, 'départ sans transmission : voix sans porteur');
select is((select count(*)::int from public.ballot_eligibility where ballot_id = pg_temp.b('b4')), 4,
  'le partant reste dans la base figée (présent non votant)');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.set_assembly_status(pg_temp.ag(), 'closed', null) $$, 'P0001', 'ballot_open',
  'pas de clôture de séance avec un scrutin ouvert');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select set_config('test.res4', public.close_ballot(pg_temp.b('b4'))::text, true);
select is(current_setting('test.res4')::jsonb ->> 'outcome', 'rejected',
  'abstentions comptées : 3 pour sur 6 exprimés, pas de majorité');
select is(current_setting('test.res4')::jsonb -> 'tallies' -> 'not_voted' ->> 'weight', '5.000000', 'non votants : Charlie');

-- ----- Annulation et reprise -----
select throws_ok($$ select public.cancel_ballot(pg_temp.b('b4'), ' ') $$, 'P0001', 'cancel_reason_required', 'motif obligatoire');
select lives_ok($$ select public.cancel_ballot(pg_temp.b('b4'), 'Erreur de texte') $$, 'scrutin clos annulé');
select is(public.open_ballot(current_setting('test.r4')::uuid) ->> 'round', '2', 'reprise : second tour');
reset role;

-- ----- SA : pouvoirs en blanc selon l'avis du conseil (B7) -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGO SA', 'ago', 'company',
  'sa', '2026-06-15 18:00')::text, true);
select public.update_assembly_rules(pg_temp.ag(), 1, null,
  '{"max_count": null, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "board_recommendation", "allow_transfer_on_departure": true}',
  '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}');
select public.import_members(pg_temp.ag(), $$[
  {"external_ref": "P", "last_name": "Président", "weights": {"voix": 10}},
  {"external_ref": "X", "last_name": "Xavier", "weights": {"voix": 30}}
]$$, 'append', false);
select set_config('test.r5', public.upsert_resolution(pg_temp.ag(), null, pg_temp.res('Sans avis'))::text, true);
select set_config('test.r6', public.upsert_resolution(pg_temp.ag(), null,
  pg_temp.res('Agréée', '{"board_recommendation": "for"}'))::text, true);
select public.upsert_attendee(pg_temp.ag(), null, 'Paul', null, null, array[pg_temp.m('P')], false);
select public.set_president(pg_temp.ag(), pg_temp.att('Paul'));
select public.grant_proxy(pg_temp.ag(), pg_temp.m('X'), null, 'blank');
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a3', 'president');
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
select public.check_in(pg_temp.ag(), pg_temp.att('Paul'));
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select public.open_ballot(current_setting('test.r5')::uuid) $$, 'P0001', 'board_recommendation_required',
  'pouvoirs en blanc à voter : l''avis du conseil est requis');
select set_config('test.b6', public.open_ballot(current_setting('test.r6')::uuid) ->> 'ballot_id', true);
reset role;
select results_eq(format($$ select choice, channel::text from public.votes where ballot_id = %L $$, pg_temp.b('b6')),
  $$ values ('for', 'operator') $$, 'le pouvoir en blanc vote d''office selon l''avis du conseil');
select is((select holder_attendee_id from public.ballot_eligibility where ballot_id = pg_temp.b('b6') and member_id = pg_temp.m('X')),
  null, 'le président ne peut pas en changer le sens');

-- ----- Intégrité : un vote ajouté hors RPC est détecté -----
select set_config('test.ag', (select assembly_id from public.ballots where id = pg_temp.b('b1'))::text, true);
insert into public.vote_events (ballot_id, member_id, choice, weight, revision, channel, at)
values (pg_temp.b('b1'), pg_temp.m('C'), 'for', 5, 1, 'device', clock_timestamp());
select is(private.verify_audit_chain_unchecked(pg_temp.ag()) ->> 'reason', 'ballot_digest_mismatch',
  'un vote ajouté après la clôture rompt l''empreinte');
select throws_ok($$ delete from public.vote_events $$, 'P0001', 'append_only', 'historique des votes en ajout seul');

select * from finish();
rollback;
