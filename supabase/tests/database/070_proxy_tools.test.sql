-- Outils de saisie des pouvoirs : désignation du mandataire, import en masse (tout ou rien),
-- scans signés (Storage), synthèse des plafonds, isolation.
begin;
select plan(36);

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
create function pg_temp.codes(p_report jsonb) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'code' order by (e ->> 'line')::int), '{}') from jsonb_array_elements(p_report -> 'errors') e $$;
grant execute on function pg_temp.ag(), pg_temp.mem(text), pg_temp.codes(jsonb) to authenticated;

-- AG : 2 pouvoirs au plus par mandataire ; membres de 100 voix (total 1 000).
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGO', 'ago', 'association',
  '', '2026-06-15 14:00')::text, true);
select (public.import_members(pg_temp.ag(), $$[
  {"external_ref": "M1", "last_name": "Un", "first_name": "Ana", "weights": {"voix": 100}},
  {"external_ref": "M2", "last_name": "Deux", "weights": {"voix": 100}},
  {"external_ref": "M3", "last_name": "Trois", "weights": {"voix": 100}},
  {"external_ref": "M4", "last_name": "Quatre", "weights": {"voix": 100}},
  {"external_ref": "M5", "last_name": "Cinq", "weights": {"voix": 100}},
  {"external_ref": "M6", "company_name": "Six SARL", "representative_name": "Sixtine Gérante", "weights": {"voix": 100}},
  {"external_ref": "M7", "last_name": "Sept", "weights": {"voix": 100}},
  {"external_ref": "M8", "last_name": "Huit", "weights": {"voix": 100}},
  {"external_ref": "M9", "last_name": "Neuf", "weights": {"voix": 100}},
  {"external_ref": "M10", "last_name": "Dix", "weights": {"voix": 100}}
]$$, 'append', false) ->> 'ok');
select public.update_assembly_rules(pg_temp.ag(), 1, null,
  '{"max_count": 2, "max_share": null, "share_key": "primary", "combine": "and", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
  '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}');

-- ----- Désignation du mandataire -----
select ok(set_config('test.p1', public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M2'),
  jsonb_build_object('member_id', pg_temp.mem('M1')), 'named')::text, true) is not null,
  'pouvoir à un autre membre');
select results_eq($$ select a.full_name from public.attendees a join public.attendee_members am on am.attendee_id = a.id
  where am.member_id = pg_temp.mem('M1') $$, array['UN Ana'], 'la personne qui porte le membre est créée');
select lives_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M3'), jsonb_build_object('member_ref', 'M1'), 'named') $$,
  'second pouvoir au même membre (par référence)');
select is((select count(*)::int from public.attendees where assembly_id = pg_temp.ag()), 1,
  'la personne existante est réutilisée');
select lives_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M4'), jsonb_build_object('member_ref', 'M6'), 'named') $$,
  'pouvoir à une personne morale');
select is((select a.full_name from public.attendees a join public.attendee_members am on am.attendee_id = a.id
           where am.member_id = pg_temp.mem('M6')), 'Sixtine Gérante', 'personne morale : son représentant porte le pouvoir');
select lives_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M5'), '{"full_name": "Maître Tiers", "email": "tiers@exemple.fr"}', 'named') $$,
  'pouvoir à un tiers');

-- Plafond dépassé : rien n'est créé, pas même le mandataire.
select set_config('test.n', (select count(*) from public.attendees where assembly_id = pg_temp.ag())::text, true);
select throws_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M7'), jsonb_build_object('member_ref', 'M1'), 'named') $$,
  'P0001', 'proxy_rule_violation', 'plafond : 3e pouvoir refusé');
select throws_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M7'), jsonb_build_object('member_ref', 'M1'), 'named', 'Dérogation') $$,
  'P0001', 'proxy_rule_violation', 'dérogation refusée hors bureau');
select throws_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M7'), jsonb_build_object('member_ref', 'M7'), 'named') $$,
  'P0001', 'proxy_rule_violation', 'pas de pouvoir à soi-même');
select is((select count(*)::int from public.attendees where assembly_id = pg_temp.ag()), current_setting('test.n')::int,
  'saisie refusée : la personne créée pour l''occasion est annulée avec elle');
select throws_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M7'), '{"member_ref": "INCONNU"}', 'named') $$,
  'P0001', 'holder_not_found', 'mandataire introuvable');
select throws_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M7'), jsonb_build_object('attendee_id', gen_random_uuid()), 'named') $$,
  'P0001', 'holder_not_found', 'personne d''une autre AG refusée');
select lives_ok($$ select public.grant_proxy_to(pg_temp.ag(), pg_temp.mem('M7'), null, 'blank') $$,
  'pouvoir en blanc sans mandataire');

-- ----- Synthèse -----
select is((select h ->> 'proxy_count' from jsonb_array_elements(public.proxy_overview(pg_temp.ag()) -> 'holders') h
           where h ->> 'full_name' = 'UN Ana'), '2', 'synthèse : 2 pouvoirs pour Ana');
select is((select (h ->> 'held_weight')::numeric from jsonb_array_elements(public.proxy_overview(pg_temp.ag()) -> 'holders') h
           where h ->> 'full_name' = 'UN Ana'), 300.0, 'voix détenues : 100 propres + 200 par pouvoirs');
select is((select bool_and((h ->> 'compliant')::boolean) from jsonb_array_elements(public.proxy_overview(pg_temp.ag()) -> 'holders') h),
  true, 'tous les mandataires respectent les plafonds');
select is(public.proxy_overview(pg_temp.ag()) ->> 'pending_blank', '1', 'pouvoirs en blanc en attente du président');

-- ----- Import -----
select set_config('test.r', public.import_proxies(pg_temp.ag(), $$[
  {"line": 2, "grantor_ref": "M8", "holder_name": "maître tiers"},
  {"line": 3, "grantor_ref": "M9", "holder_ref": "M6"}
]$$, true)::text, true);
select is(current_setting('test.r')::jsonb ->> 'ok', 'true', 'import à blanc valide');
select is(current_setting('test.r')::jsonb ->> 'valid', '2', '2 lignes valides');
select is((select count(*)::int from public.proxies where grantor_member_id in (pg_temp.mem('M8'), pg_temp.mem('M9'))), 0,
  'à blanc : rien n''est créé');

select set_config('test.r', public.import_proxies(pg_temp.ag(), $$[
  {"line": 2, "grantor_ref": "M8", "holder_name": "Nouveau Tiers"},
  {"line": 3, "grantor_ref": "INCONNU", "holder_ref": "M1"},
  {"line": 4, "grantor_ref": "M9"},
  {"line": 5, "grantor_ref": "M10", "holder_ref": "M1"},
  {"line": 6, "grantor_ref": "M2", "holder_ref": "M6"},
  {"line": 7, "grantor_ref": "M9", "type": "procuration"}
]$$, false)::text, true);
select is(pg_temp.codes(current_setting('test.r')::jsonb),
  array['grantor_not_found', 'missing_holder', 'proxy_rule_violation', 'proxy_exists', 'invalid_proxy_type'],
  'chaque ligne refusée est expliquée');
select is((select e -> 'detail' -> 0 ->> 'code' from jsonb_array_elements(current_setting('test.r')::jsonb -> 'errors') e
           where e ->> 'line' = '5'), 'max_count_exceeded', 'le détail du plafond dépassé est fourni');
select is((select count(*)::int from public.proxies where grantor_member_id = pg_temp.mem('M8')), 0,
  'tout ou rien : la ligne valide n''est pas importée');
select is((select count(*)::int from public.attendees where full_name = 'Nouveau Tiers'), 0,
  'tout ou rien : le tiers créé pour la ligne valide est annulé');

select set_config('test.r', public.import_proxies(pg_temp.ag(), $$[
  {"line": 2, "grantor_ref": "M8", "holder_name": "maître tiers"},
  {"line": 3, "grantor_ref": "M9", "holder_ref": "M6"},
  {"line": 4, "grantor_ref": "M10", "type": "blank"}
]$$, false, '{"filename": "pouvoirs.xlsx"}')::text, true);
select is(current_setting('test.r')::jsonb ->> 'created', '3', 'import réel : 3 pouvoirs');
select is((select count(*)::int from public.attendees where lower(full_name) = 'maître tiers'), 1,
  'un tiers de même nom est réutilisé (sans doublon)');
reset role;
select is((select payload -> 'source' ->> 'filename' from public.audit_log where chain_id = pg_temp.ag()
           and action = 'proxies.imported'), 'pouvoirs.xlsx', 'import audité avec le fichier source');

-- ----- Scans signés -----
select set_config('test.doc', pg_temp.ag()::text || '/' || current_setting('test.p1') || '/scan.pdf', true);
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('proxy-documents', %L, '{"size": 10}') $$,
  current_setting('test.doc')), '42501', null, 'une autre organisation ne dépose pas de scan');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('proxy-documents', %L, '{"size": 10}') $$,
  current_setting('test.doc')), 'scan déposé dans le dossier du pouvoir');
select throws_ok(format($$ select public.set_proxy_document(%L, %L) $$,
  (select id from public.proxies where grantor_member_id = pg_temp.mem('M3')), current_setting('test.doc')),
  'P0001', 'invalid_document', 'le scan d''un pouvoir ne s''attache pas à un autre');
select throws_ok(format($$ select public.set_proxy_document(%L, %L) $$, current_setting('test.p1'),
  pg_temp.ag()::text || '/' || current_setting('test.p1') || '/absent.pdf'), 'P0001', 'invalid_document',
  'un fichier non déposé ne s''attache pas');
select lives_ok(format($$ select public.set_proxy_document(%L, %L) $$, current_setting('test.p1'), current_setting('test.doc')),
  'scan attaché');
reset role;

-- ----- Isolation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.proxy_overview(pg_temp.ag()) $$, 'P0001', 'not_found', 'synthèse invisible hors organisation');
select throws_ok($$ select public.import_proxies(pg_temp.ag(), '[{"grantor_ref": "M1"}]', true) $$, 'P0001', 'not_found',
  'import impossible hors organisation');
reset role;

select is(private.verify_audit_chain_unchecked(pg_temp.ag()) ->> 'ok', 'true', 'chaîne d''audit intègre');

select * from finish();
rollback;
