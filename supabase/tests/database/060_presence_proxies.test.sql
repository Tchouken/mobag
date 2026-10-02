-- Moteur de présence et de pouvoirs : règles de pouvoirs, émargement, départs (5.6), retours,
-- quorum, isolation, journal et audit. Scénario d'une AG de SA.
--
-- Membres (clé principale « voix », total 1 100) :
--   A 100 (Alice) · B 50 (Bruno) · C 200 (Carla) · D 300 (Delta SAS, représentée par Diane)
--   E 150 (Émile) · F 200 (Fabien, non éligible mandataire) · G 100 (Gaston, pouvoir en blanc)
-- Personnes : Alice, Bruno, Carla, Diane, Émile, Fabien (portent leur membre), Thomas (tiers),
--             Sylvain (syndic, non éligible mandataire).
begin;
select plan(79);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test');
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
create function pg_temp.mem(p_ref text) returns uuid language sql as $$
  select id from public.members where assembly_id = pg_temp.ag() and external_ref = p_ref $$;
create function pg_temp.att(p_name text) returns uuid language sql as $$
  select id from public.attendees where assembly_id = pg_temp.ag() and full_name = p_name $$;
create function pg_temp.ver(p_name text) returns int language sql as $$
  select version from public.attendees where assembly_id = pg_temp.ag() and full_name = p_name $$;
create function pg_temp.st(p_ref text) returns text language sql as $$
  select coalesce((select mp.status::text || coalesce(':' || a.full_name, '')
                   from public.member_presence mp left join public.attendees a on a.id = mp.holder_attendee_id
                   where mp.member_id = pg_temp.mem(p_ref)), 'expected') $$;
create function pg_temp.codes(p_violations jsonb) returns text[] language sql as $$
  select coalesce(array_agg(v ->> 'code' order by v ->> 'code'), '{}') from jsonb_array_elements(p_violations) v $$;
create function pg_temp.defaults() returns jsonb language sql as $$
  select '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}'::jsonb $$;
grant execute on function pg_temp.defaults(), pg_temp.ag(), pg_temp.mem(text), pg_temp.att(text), pg_temp.ver(text), pg_temp.st(text),
  pg_temp.codes(jsonb) to authenticated;

-- ----- Préparation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGO', 'ago', 'company',
  'sa', '2026-06-15 14:00')::text, true);
select (public.import_members(pg_temp.ag(), $$[
  {"line": 2, "last_name": "Alpha", "first_name": "Alice", "external_ref": "A", "weights": {"voix": 100}},
  {"line": 3, "last_name": "Bravo", "first_name": "Bruno", "external_ref": "B", "weights": {"voix": 50}},
  {"line": 4, "last_name": "Charlie", "first_name": "Carla", "external_ref": "C", "weights": {"voix": 200}},
  {"line": 5, "company_name": "Delta SAS", "representative_name": "Diane", "external_ref": "D", "weights": {"voix": 300}},
  {"line": 6, "last_name": "Echo", "first_name": "Émile", "external_ref": "E", "weights": {"voix": 150}},
  {"line": 7, "last_name": "Foxtrot", "first_name": "Fabien", "external_ref": "F", "is_proxy_ineligible": true, "weights": {"voix": 200}},
  {"line": 8, "last_name": "Golf", "first_name": "Gaston", "external_ref": "G", "weights": {"voix": 100}}
]$$, 'append', false) ->> 'ok');
-- Règles : 2 pouvoirs et 30 % des voix au plus (les deux), sous-délégation interdite sauf au départ.
select public.update_assembly_rules(pg_temp.ag(), 1,
  (select params from public.rule_presets where code = 'sa_ago_q1'),
  '{"max_count": 2, "max_share": {"num": 3, "den": 10}, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
  pg_temp.defaults());
select public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null, array[pg_temp.mem('A')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Bruno', null, null, array[pg_temp.mem('B')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Carla', null, null, array[pg_temp.mem('C')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Diane', null, null, array[pg_temp.mem('D')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Émile', null, null, array[pg_temp.mem('E')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Fabien', null, null, array[pg_temp.mem('F')], false);
select public.upsert_attendee(pg_temp.ag(), null, 'Thomas', 'thomas@exemple.fr', null, null, false);
select public.upsert_attendee(pg_temp.ag(), null, 'Sylvain', null, null, null, true);

select throws_ok($$ select public.upsert_attendee(pg_temp.ag(), null, 'Doublon', null, null, array[pg_temp.mem('D')], false) $$,
  'P0001', 'member_already_embodied', 'un membre n''est porté que par une seule personne');

-- ----- Pouvoirs avant séance -----
select ok(public.grant_proxy(pg_temp.ag(), pg_temp.mem('B'), pg_temp.att('Alice'), 'named') is not null,
  'Bruno donne pouvoir à Alice');
select is(pg_temp.st('B'), 'expected', 'Alice absente : Bruno n''est pas encore représenté');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('B'), pg_temp.att('Thomas'), 'named') $$,
  'P0001', 'proxy_exists', 'un seul pouvoir vivant par mandant');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('A'), pg_temp.att('Alice'), 'named', null, 'test') $$,
  'P0001', 'proxy_rule_violation', 'pas de pouvoir à soi-même, même par dérogation');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('E'), pg_temp.att('Sylvain'), 'named') $$,
  'P0001', 'proxy_rule_violation', 'personne non éligible mandataire refusée');
reset role;  -- helper privé : appelé hors session utilisateur
select is(pg_temp.codes(private.check_proxy_rules(pg_temp.ag(), pg_temp.att('Fabien'), array[pg_temp.mem('G')])),
  array['holder_ineligible'], 'un membre non éligible ne peut pas recevoir de pouvoir');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select ok(public.grant_proxy(pg_temp.ag(), pg_temp.mem('E'), pg_temp.att('Alice'), 'named') is not null,
  'Émile donne pouvoir à Alice (2 pouvoirs, 300/1 100 voix = 27 %)');
reset role;  -- helper privé : appelé hors session utilisateur
select is(pg_temp.codes(private.check_proxy_rules(pg_temp.ag(), pg_temp.att('Alice'), array[pg_temp.mem('C')])),
  array['max_count_exceeded', 'max_share_exceeded'], 'un 3e pouvoir dépasse les deux plafonds');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('C'), pg_temp.att('Alice'), 'named') $$,
  'P0001', 'proxy_rule_violation', 'plafond : saisie bloquée');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('C'), pg_temp.att('Alice'), 'named', null, 'Accord du bureau') $$,
  'P0001', 'proxy_rule_violation', 'dérogation refusée hors bureau');
select public.assign_assembly_staff(pg_temp.ag(), '00000000-0000-0000-0000-0000000000a2', 'president');
select ok(set_config('test.pc', public.grant_proxy(pg_temp.ag(), pg_temp.mem('C'), pg_temp.att('Alice'), 'named', null,
  'Accord du bureau')::text, true) is not null, 'dérogation motivée par le bureau');
select is((select derogation_reason from public.proxies where id = current_setting('test.pc')::uuid), 'Accord du bureau',
  'la dérogation est portée par le pouvoir');

-- Pouvoir en blanc : en attente tant qu'aucun président n'est désigné.
select ok(public.grant_proxy(pg_temp.ag(), pg_temp.mem('G'), null, 'blank') is not null, 'pouvoir en blanc de Gaston');
select is((select status::text from public.proxies where grantor_member_id = pg_temp.mem('G')), 'pending',
  'pouvoir en blanc en attente du président');
select is(public.set_president(pg_temp.ag(), pg_temp.att('Thomas')) ->> 'blank_proxies', '1', 'Thomas désigné président');
select is((select holder_attendee_id from public.proxies where grantor_member_id = pg_temp.mem('G') and status = 'active'),
  pg_temp.att('Thomas'), 'le pouvoir en blanc lui est attribué');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('F'), null, 'temporary') $$,
  'P0001', 'invalid_proxy_type', 'un pouvoir temporaire ne se saisit pas à la main');
reset role;

-- Combinaison « ou » (copropriété) : nombre dépassé mais part respectée → autorisé.
savepoint combine;
update public.assemblies set proxy_rules = proxy_rules || '{"max_count": 1, "max_share": {"num": 1, "den": 2}, "combine": "or"}'
where id = pg_temp.ag();
select is(pg_temp.codes(private.check_proxy_rules(pg_temp.ag(), pg_temp.att('Thomas'), array[pg_temp.mem('A')])),
  '{}'::text[], '« ou » : 2 pouvoirs (> 1) mais 18 % des voix (≤ 50 %) : autorisé');
update public.assemblies set proxy_rules = proxy_rules || '{"combine": "and"}' where id = pg_temp.ag();
select is(pg_temp.codes(private.check_proxy_rules(pg_temp.ag(), pg_temp.att('Thomas'), array[pg_temp.mem('A')])),
  array['max_count_exceeded'], '« et » : le dépassement du nombre suffit à bloquer');
rollback to savepoint combine;

-- ----- Séance -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
-- Règles de séance : 3 pouvoirs et 50 % au plus.
select public.update_assembly_rules(pg_temp.ag(), (select version from public.assemblies where id = pg_temp.ag()),
  (select params from public.rule_presets where code = 'sa_ago_q1'),
  '{"max_count": 3, "max_share": {"num": 1, "den": 2}, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
  pg_temp.defaults());
select public.set_assembly_status(pg_temp.ag(), 'convened', null);

select throws_ok($$ select public.check_in(pg_temp.ag(), pg_temp.att('Alice'), null, null, 99) $$,
  'P0001', 'version_conflict', 'émargement : version périmée refusée (deux postes d''accueil)');
-- Signature déposée dans le dossier d'Alice (dépôt direct, hors RLS, pour le test).
reset role;
select set_config('test.sig', pg_temp.ag()::text || '/' || pg_temp.att('Alice')::text || '/signature.png', true);
insert into storage.objects (bucket_id, name, metadata) values ('signatures', current_setting('test.sig'), '{"size": 100}');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select is((public.check_in(pg_temp.ag(), pg_temp.att('Alice'), null, current_setting('test.sig')) -> 'totals' -> 0 ->> 'weight')::numeric,
  500.0, 'Alice émarge : 100 propres + 50 + 150 + 200 par pouvoirs');
select results_eq($$ select pg_temp.st('A'), pg_temp.st('B'), pg_temp.st('C'), pg_temp.st('E') $$,
  $$ values ('present:Alice', 'represented:Alice', 'represented:Alice', 'represented:Alice') $$,
  'présence calculée : Alice présente, ses mandants représentés');
select throws_ok($$ select public.check_in(pg_temp.ag(), pg_temp.att('Alice')) $$,
  'P0001', 'attendee_not_expected', 'pas de double émargement');
select throws_ok($$ select public.check_in(pg_temp.ag(), pg_temp.att('Bruno'), null, 'autre-ag/sig.png') $$,
  'P0001', 'invalid_signature', 'signature hors du dossier de l''AG refusée');

-- Quorum : 500 / 1 100 ≥ 1/5.
select is((public.current_quorum(pg_temp.ag()) -> 'counts' -> 'present_represented')::jsonb,
  '{"heads": 4, "weight": 500}'::jsonb, 'quorum : 4 membres, 500 voix présentes ou représentées');
select is(public.current_quorum(pg_temp.ag()) -> 'evaluation' ->> 'reached', 'true', 'quorum de 1/5 atteint');

-- Carla arrive : son pouvoir tombe, elle reprend ses voix.
select lives_ok($$ select public.check_in(pg_temp.ag(), pg_temp.att('Carla')) $$, 'Carla émarge');
select is((select revoked_kind from public.proxies where id = current_setting('test.pc')::uuid), 'grantor_present',
  'le pouvoir de Carla est révoqué à son arrivée');
select is(pg_temp.st('C'), 'present:Carla', 'Carla vote pour elle-même');
select throws_ok($$ select public.grant_proxy(pg_temp.ag(), pg_temp.mem('C'), pg_temp.att('Thomas'), 'named') $$,
  'P0001', 'grantor_present', 'un membre présent ne donne pas de pouvoir');

-- Ajout sur place d'une personne non prévue.
select ok((public.check_in(pg_temp.ag(), null, '{"full_name": "Zoé (tiers)"}') ->> 'attendee_id') is not null,
  'personne ajoutée sur place');
select throws_ok($$ select public.check_in(pg_temp.ag(), null, jsonb_build_object('full_name', 'Fausse Diane',
  'member_ids', jsonb_build_array(pg_temp.mem('D')))) $$, 'P0001', 'member_already_embodied',
  'on ne crée pas sur place un second porteur du même membre');
select lives_ok($$ select public.check_in(pg_temp.ag(), pg_temp.att('Diane')) $$, 'Diane (représentante de Delta SAS) émarge');
select lives_ok($$ select public.check_in(pg_temp.ag(), pg_temp.att('Thomas')) $$, 'Thomas (président) émarge');
select is(pg_temp.st('G'), 'represented:Thomas', 'le pouvoir en blanc compte dès l''arrivée du président');
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);

-- ----- Départ avec transfert (5.6 a) -----
-- Vers Diane : 300 propres + 100 + 50 + 150 = 600 / 1 100 > 50 % → refusé, rien ne change.
select throws_ok($$ select public.check_out(pg_temp.att('Alice'), 'transfer', pg_temp.att('Diane')) $$,
  'P0001', 'proxy_rule_violation', 'départ : plafond du nouveau mandataire contrôlé');
select is(pg_temp.st('A'), 'present:Alice', 'départ refusé : tout ou rien');
-- Vers Zoé : 3 pouvoirs, 300 voix (27 %) → accepté.
select is(jsonb_array_length(public.check_out(pg_temp.att('Alice'), 'transfer', pg_temp.att('Zoé (tiers)')) -> 'changes'), 3,
  'Alice part et confie ses voix et ses pouvoirs à Zoé');
select results_eq($$ select pg_temp.st('A'), pg_temp.st('B'), pg_temp.st('E') $$,
  $$ values ('represented:Zoé (tiers)', 'represented:Zoé (tiers)', 'represented:Zoé (tiers)') $$,
  'voix propres et pouvoirs transmis (DECISIONS B1)');
select is((select count(*)::int from public.proxies where parent_proxy_id is not null and status = 'active'
           and holder_attendee_id = pg_temp.att('Zoé (tiers)')), 2, 'pouvoirs transmis chaînés à leur origine');
select is((select status::text from public.attendees where id = pg_temp.att('Alice')), 'left', 'Alice est sortie');
select is((public.current_quorum(pg_temp.ag()) -> 'counts' -> 'present_represented' ->> 'weight')::numeric, 900.0,
  'le décompte ne bouge pas (900 voix) : les voix sont restées dans la salle');

-- Retour d'Alice : ses voix propres reviennent ; les pouvoirs transmis sans retour prévu restent.
select lives_ok($$ select public.return_attendee(pg_temp.att('Alice')) $$, 'Alice revient');
select results_eq($$ select pg_temp.st('A'), pg_temp.st('B') $$,
  $$ values ('present:Alice', 'represented:Zoé (tiers)') $$,
  'retour : voix propres récupérées, pouvoirs transmis définitivement conservés par Zoé');

-- ----- Départ temporaire (5.6 c) -----
select lives_ok($$ select public.check_out(pg_temp.att('Diane'), 'temporary', pg_temp.att('Carla')) $$,
  'Diane sort temporairement et confie les voix de Delta SAS à Carla');
select is(pg_temp.st('D'), 'represented:Carla', 'Delta SAS représentée par Carla');
select lives_ok($$ select public.return_attendee(pg_temp.att('Diane')) $$, 'Diane revient');
select is(pg_temp.st('D'), 'present:Diane', 'Delta SAS de nouveau portée par Diane');
select is((select count(*)::int from public.proxies where grantor_member_id = pg_temp.mem('D') and status = 'active'), 0,
  'le pouvoir temporaire est révoqué au retour');

-- ----- Transmission interdite : les pouvoirs détenus attendent le retour -----
reset role;
update public.assemblies set proxy_rules = proxy_rules || '{"allow_transfer_on_departure": false}' where id = pg_temp.ag();
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select is(jsonb_array_length(public.check_out(pg_temp.att('Zoé (tiers)'), 'transfer', pg_temp.att('Thomas'))
  -> 'held_proxies_not_transferred'), 2, 'sous-délégation interdite : les 2 pouvoirs de Zoé ne sont pas transmis');
select results_eq($$ select pg_temp.st('B'), pg_temp.st('E') $$, $$ values ('left', 'left') $$,
  'leurs mandants sortent du décompte');
select lives_ok($$ select public.return_attendee(pg_temp.att('Zoé (tiers)')) $$, 'Zoé revient');
select results_eq($$ select pg_temp.st('B'), pg_temp.st('E') $$,
  $$ values ('represented:Zoé (tiers)', 'represented:Zoé (tiers)') $$, 'ses pouvoirs comptent de nouveau');

-- ----- Sortie sans transmission (5.6 b) -----
select lives_ok($$ select public.check_out(pg_temp.att('Carla'), 'leave') $$, 'Carla part sans donner de pouvoir');
select is(pg_temp.st('C'), 'left', 'Carla sort du décompte');
select is((public.current_quorum(pg_temp.ag()) -> 'counts' -> 'left')::jsonb, '{"heads": 1, "weight": 200}'::jsonb,
  'quorum : voix parties comptées à part');
select throws_ok($$ select public.check_out(pg_temp.att('Carla'), 'leave') $$, 'P0001', 'attendee_not_present',
  'on ne sort pas deux fois');
select throws_ok($$ select public.check_out(pg_temp.att('Alice'), 'transfer', pg_temp.att('Carla')) $$,
  'P0001', 'transfer_target_not_present', 'on ne transmet pas à une personne absente');
select throws_ok($$ select public.check_out(pg_temp.att('Alice'), 'leave', pg_temp.att('Thomas')) $$,
  'P0001', 'invalid_transfer_target', 'une sortie sans transmission n''a pas de destinataire');

-- ----- Révocation manuelle -----
select lives_ok($$ select public.revoke_proxy((select id from public.proxies where grantor_member_id = pg_temp.mem('G')
  and status = 'active'), 'Pouvoir retiré par le mandant') $$, 'révocation d''un pouvoir');
select is(pg_temp.st('G'), 'left', 'le mandant sort du décompte');

-- ----- Verrouillages en séance -----
select throws_ok($$ select public.update_assembly_rules(pg_temp.ag(), 1, null,
  (select proxy_rules from public.assemblies where id = pg_temp.ag()), pg_temp.defaults()) $$,
  'P0001', 'assembly_locked', 'règles verrouillées en séance');
select throws_ok($$ select public.set_assembly_status(pg_temp.ag(), 'draft') $$,
  'P0001', 'transition_not_available', 'pas de retour en brouillon une fois l''émargement commencé');
reset role;
select throws_ok($$ delete from public.members where id = pg_temp.mem('B') $$, 'P0001', 'member_in_use',
  'un membre mandant ou porté ne se supprime pas');
select throws_ok($$ update public.attendance_events set mode = 'leave' $$, 'P0001', 'append_only',
  'journal des mouvements en ajout seul');

-- ----- Isolation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is_empty($$ select 1 from public.attendees union all select 1 from public.proxies
                   union all select 1 from public.member_presence union all select 1 from public.attendance_events $$,
  'une autre organisation ne voit ni personnes, ni pouvoirs, ni présences');
select throws_ok($$ select public.check_in(pg_temp.ag(), null, '{"full_name": "Intrus"}') $$, 'P0001', 'not_found',
  'une autre organisation n''émarge personne');
select throws_ok($$ select public.current_quorum(pg_temp.ag()) $$, 'P0001', 'not_found', 'ni ne lit le quorum');
reset role;

-- ----- Clôture -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$ select public.set_assembly_status(pg_temp.ag(), 'closed', 'Fin de séance') $$, 'clôture de la séance');
select throws_ok($$ select public.return_attendee(pg_temp.att('Carla')) $$, 'P0001', 'assembly_locked',
  'AG close : plus aucun mouvement');
reset role;

-- ----- Évaluation des règles (comparaisons exactes) -----
select is(private.evaluate_rule('{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 5, "comparison": "gte"}]}',
  '{"present_represented": {"weight": 200, "heads": 1}, "all_members": {"weight": 1000, "heads": 9}}') ->> 'reached', 'true',
  'égalité exacte au seuil : « au moins » est atteint');
select is(private.evaluate_rule('{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}',
  '{"for": {"weight": 50, "heads": 1}, "expressed": {"weight": 100, "heads": 2}}') ->> 'reached', 'false',
  'égalité exacte au seuil : « plus de » ne l''est pas');
select is(private.evaluate_rule('{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 2, "den": 3, "comparison": "gte"}]}',
  '{"for": {"weight": 666.666667, "heads": 1}, "expressed": {"weight": 1000, "heads": 2}}') ->> 'reached', 'true',
  'calcul exact en numeric (2/3 à 10⁻⁶ près)');
select is(private.evaluate_rule('{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}',
  '{"for": {"weight": 0, "heads": 0}, "expressed": {"weight": 0, "heads": 0}}') ->> 'reached', 'false',
  'base nulle : aucune condition n''est satisfaite');
select is(private.evaluate_rule('{"conditions": []}', '{}') ->> 'reached', 'true', 'sans condition : atteint');
select is(private.evaluate_rule('{"conditions": [
    {"measure": "heads", "numerator": "for", "base": "all_members", "num": 1, "den": 2, "comparison": "gt"},
    {"measure": "weight", "numerator": "for", "base": "all_members", "num": 2, "den": 3, "comparison": "gte"}]}',
  '{"for": {"weight": 700, "heads": 4}, "all_members": {"weight": 1000, "heads": 10}}') ->> 'reached', 'false',
  'double majorité : les deux conditions sont requises (têtes insuffisantes)');

-- ----- Audit -----
select is(private.verify_audit_chain_unchecked(pg_temp.ag()) ->> 'ok', 'true', 'chaîne d''audit intègre');
select ok((select count(*) from public.audit_log where chain_id = pg_temp.ag() and action = 'proxy.derogation') = 1,
  'la dérogation est auditée');

select * from finish();
rollback;
