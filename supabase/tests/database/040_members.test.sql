-- Membres : import (validation, tout ou rien, modes, totaux), édition unitaire,
-- intégrité des voix, isolation, verrouillage et audit.
begin;
select plan(50);

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

-- Codes d'erreur d'un rapport, triés.
create function pg_temp.codes(p_report jsonb, p_kind text) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'code' order by e ->> 'code'), '{}') from jsonb_array_elements(p_report -> p_kind) e;
$$;
grant execute on function pg_temp.codes(jsonb, text) to authenticated;

-- AG de SA avec deux clés : voix (principale, 100 déclarées) et actions de préférence (10).
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGO', 'ago', 'company',
  'sa', '2026-06-15 14:00')::text, true);
select public.upsert_weight_key(current_setting('test.ag')::uuid,
  (select id from public.weight_keys where assembly_id = current_setting('test.ag')::uuid and code = 'voix'),
  'voix', 'Voix', 100, true);
select public.upsert_weight_key(current_setting('test.ag')::uuid, null, 'pref', 'Actions de préférence', 10, false);
reset role;

-- Fichier valide : personne, personne morale déduite, voix décimales en texte.
select set_config('test.rows', $$[
  {"line": 2, "last_name": "Dupont", "first_name": "Jean", "external_ref": "A1", "email": "Jean.Dupont@Exemple.FR",
   "weights": {"voix": "50", "pref": 10}},
  {"line": 3, "company_name": "Holding  Martin   SAS", "representative_name": "Paul Martin", "external_ref": "A2",
   "weights": {"voix": "37.5"}},
  {"line": 4, "last_name": "Durand", "first_name": "Léa", "external_ref": "A3", "is_proxy_ineligible": true,
   "weights": {"voix": 12.5}}
]$$, true);

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');

-- ----- À blanc -----
select set_config('test.r', public.import_members(current_setting('test.ag')::uuid,
  current_setting('test.rows')::jsonb, 'append', true, '{"filename": "associes.csv"}')::text, true);
select is(current_setting('test.r')::jsonb ->> 'ok', 'true', 'à blanc : fichier valide');
select is((select count(*)::int from public.members), 0, 'à blanc : rien n''est écrit');
select is(pg_temp.codes(current_setting('test.r')::jsonb, 'warnings'), '{}'::text[],
  'totaux conformes aux totaux déclarés : aucun avertissement');
select is((current_setting('test.r')::jsonb -> 'totals' -> 0 ->> 'projected')::numeric, 100.0,
  'total projeté de la clé principale');

-- ----- Import réel -----
select is(public.import_members(current_setting('test.ag')::uuid, current_setting('test.rows')::jsonb, 'append', false,
  '{"filename": "associes.csv", "sha256": "abc"}') ->> 'inserted', '3', 'import : 3 membres créés');
select results_eq($$ select display_name, kind::text, email::text from public.members order by external_ref $$,
  $$ values ('DUPONT Jean', 'person', 'jean.dupont@exemple.fr'),
            ('Holding Martin SAS', 'legal_entity', null),
            ('DURAND Léa', 'person', null) $$,
  'noms normalisés, personne morale déduite, e-mail en minuscules, espaces réduits');
select is((select sum(weight) from public.member_weights mw join public.weight_keys k on k.id = mw.weight_key_id
           where k.code = 'voix'), 100.0, 'voix exactes (décimales en numeric)');
select is((select weight from public.member_weights mw join public.members m on m.id = mw.member_id
           join public.weight_keys k on k.id = mw.weight_key_id where m.external_ref = 'A2' and k.code = 'pref'),
  0.0, 'une clé absente vaut 0');
select is((select is_proxy_ineligible from public.members where external_ref = 'A3'), true,
  'marqueur « non éligible mandataire » importé');
select results_eq($$ select total_imported, members_with_weight from public.weight_key_totals where code = 'voix' $$,
  $$ values (100.000000::numeric, 3) $$, 'vue des totaux par clé');

-- ----- Ajout d'un fichier déjà importé : refusé, rien n'est écrit -----
select set_config('test.r', public.import_members(current_setting('test.ag')::uuid,
  current_setting('test.rows')::jsonb, 'append', false)::text, true);
select is(current_setting('test.r')::jsonb ->> 'ok', 'false', 'ajout : références déjà connues refusées');
select is(pg_temp.codes(current_setting('test.r')::jsonb, 'errors'), array['ref_exists', 'ref_exists', 'ref_exists'],
  'une erreur par référence existante');
select is((select count(*)::int from public.members), 3, 'tout ou rien : aucun membre ajouté');

-- ----- Erreurs de validation -----
select set_config('test.r', public.import_members(current_setting('test.ag')::uuid, $$[
  {"line": 2, "last_name": "Valide", "external_ref": "B1", "weights": {"voix": 1}},
  {"line": 3, "last_name": "Negatif", "external_ref": "B2", "weights": {"voix": -5}},
  {"line": 4, "last_name": "Texte", "external_ref": "B3", "weights": {"voix": "abc"}},
  {"line": 5, "last_name": "Virgule", "external_ref": "B4", "weights": {"voix": "1,5"}},
  {"line": 6, "last_name": "Courriel", "external_ref": "B5", "email": "pas-un-email", "weights": {"voix": 1}},
  {"line": 7, "first_name": "SansNom", "external_ref": "B6", "weights": {"voix": 1}},
  {"line": 8, "last_name": "Cle", "external_ref": "B7", "weights": {"voix": 1, "tantiemes": 3}},
  {"line": 9, "last_name": "Doublon", "external_ref": "B8", "weights": {"voix": 1}},
  {"line": 10, "last_name": "Doublon bis", "external_ref": "B8", "weights": {"voix": 1}},
  {"line": 11, "kind": "robot", "last_name": "Nature", "external_ref": "B9", "weights": {"voix": 1}}
]$$, 'append', false)::text, true);
select is(current_setting('test.r')::jsonb ->> 'ok', 'false', 'fichier avec erreurs refusé');
select is(pg_temp.codes(current_setting('test.r')::jsonb, 'errors'),
  array['duplicate_ref', 'duplicate_ref', 'invalid_email', 'invalid_kind', 'invalid_weight', 'invalid_weight',
        'negative_weight', 'unknown_weight_key'],
  'chaque erreur est détectée');
select is((select jsonb_agg(e ->> 'line' order by (e ->> 'line')::int) from jsonb_array_elements(
  current_setting('test.r')::jsonb -> 'errors') e where e ->> 'code' = 'duplicate_ref'), '["9", "10"]'::jsonb,
  'les deux lignes d''une référence en double sont signalées');
select is((select e ->> 'field' from jsonb_array_elements(current_setting('test.r')::jsonb -> 'errors') e
           where e ->> 'line' = '3'), 'weights.voix', 'le champ fautif est indiqué');
select is((select count(*)::int from public.members), 3, 'tout ou rien : la ligne valide n''est pas importée');
select is((select count(*)::int from jsonb_array_elements(current_setting('test.r')::jsonb -> 'warnings') w
           where w ->> 'code' = 'no_voting_rights'), 0,
  'pas d''avertissement « sans voix » en doublon d''une erreur sur les voix');
select is(current_setting('test.r')::jsonb ->> 'error_count', '8', 'nombre d''erreurs');

-- Le prénom seul suffit à constituer un nom (pas d'erreur missing_name), mais une ligne vide non.
select is(pg_temp.codes(public.import_members(current_setting('test.ag')::uuid,
  '[{"line": 2, "external_ref": "C1", "weights": {"voix": 1}}]', 'append', true), 'errors'),
  array['missing_name'], 'ligne sans aucun nom refusée');

-- ----- Avertissements -----
select set_config('test.r', public.import_members(current_setting('test.ag')::uuid, $$[
  {"line": 2, "last_name": "Zero", "external_ref": "D1", "email": "commun@exemple.fr", "weights": {"voix": 0}},
  {"line": 3, "last_name": "Indivisaire", "external_ref": "D2", "email": "commun@exemple.fr", "weights": {"voix": 2}}
]$$, 'append', true)::text, true);
select is(current_setting('test.r')::jsonb ->> 'ok', 'true', 'des avertissements ne bloquent pas l''import');
select is(pg_temp.codes(current_setting('test.r')::jsonb, 'warnings'),
  array['duplicate_email', 'duplicate_email', 'no_voting_rights', 'total_mismatch'],
  'avertissements : membre sans voix, e-mail partagé, écart avec le total déclaré');
select is((select e ->> 'difference' from jsonb_array_elements(current_setting('test.r')::jsonb -> 'warnings') e
           where e ->> 'code' = 'total_mismatch')::numeric, 2.0, 'écart chiffré par rapport au total déclaré');

-- ----- Mise à jour par référence -----
select set_config('test.r', public.import_members(current_setting('test.ag')::uuid, $$[
  {"line": 2, "last_name": "Dupont", "first_name": "Jean", "external_ref": "A1", "weights": {"voix": 40, "pref": 10}},
  {"line": 3, "last_name": "Nouveau", "external_ref": "A4", "weights": {"voix": 10}}
]$$, 'upsert', false)::text, true);
select is((current_setting('test.r')::jsonb ->> 'inserted') || '/' || (current_setting('test.r')::jsonb ->> 'updated'),
  '1/1', 'mise à jour : 1 membre modifié, 1 ajouté');
select is((select weight from public.member_weights mw join public.members m on m.id = mw.member_id
           join public.weight_keys k on k.id = mw.weight_key_id where m.external_ref = 'A1' and k.code = 'voix'),
  40.0, 'les voix du membre existant sont mises à jour');
select is((select version from public.members where external_ref = 'A1'), 2, 'la version du membre est incrémentée');
select is(pg_temp.codes(current_setting('test.r')::jsonb, 'warnings'), '{}'::text[],
  'totaux projetés : membres conservés + fichier = 100, sans écart');

-- ----- Remplacement -----
select is(public.import_members(current_setting('test.ag')::uuid,
  '[{"line": 2, "last_name": "Seul", "external_ref": "Z1", "weights": {"voix": 100, "pref": 10}}]', 'replace', false)
  ->> 'inserted', '1', 'remplacement');
select results_eq($$ select external_ref from public.members $$, array['Z1'], 'seuls les membres du fichier restent');

-- ----- Paramètres -----
select throws_ok(format($$ select public.import_members(%L, '[]', 'append', true) $$, current_setting('test.ag')),
  'P0001', 'empty_import', 'fichier vide refusé');
select throws_ok(format($$ select public.import_members(%L, '[{}]', 'merge', true) $$, current_setting('test.ag')),
  'P0001', 'invalid_import_mode', 'mode inconnu refusé');

-- ----- Édition unitaire -----
select ok(set_config('test.m', public.upsert_member(current_setting('test.ag')::uuid, null,
  '{"last_name": "Ajout", "first_name": "Manuel", "external_ref": "M1", "weights": {"voix": 1}}')::text, true)
  is not null, 'ajout manuel d''un membre');
select throws_ok(format($$ select public.upsert_member(%L, null, '{"last_name": "X", "external_ref": "M1"}') $$,
  current_setting('test.ag')), 'P0001', 'ref_exists', 'référence déjà utilisée refusée');
select throws_ok(format($$ select public.upsert_member(%L, %L, '{"last_name": "X", "weights": {"voix": -1}}') $$,
  current_setting('test.ag'), current_setting('test.m')), 'P0001', 'invalid_member', 'voix négative refusée');
select throws_ok(format($$ select public.upsert_member(%L, %L, '{"last_name": "Ajout"}', 9) $$,
  current_setting('test.ag'), current_setting('test.m')), 'P0001', 'version_conflict', 'version périmée refusée');
select lives_ok(format($$ select public.upsert_member(%L, %L,
  '{"last_name": "Ajout", "first_name": "Corrigé", "external_ref": "M1", "weights": {"voix": 2, "pref": 0}}', 1) $$,
  current_setting('test.ag'), current_setting('test.m')), 'modification avec la bonne version');
select is((select display_name from public.members where id = current_setting('test.m')::uuid), 'AJOUT Corrigé',
  'nom mis à jour');
select throws_ok(format($$ select public.delete_weight_key((select id from public.weight_keys
  where assembly_id = %L and code = 'pref')) $$, current_setting('test.ag')),
  'P0001', 'weight_key_in_use', 'une clé portant des voix ne se supprime pas');
select lives_ok(format($$ select public.delete_member(%L) $$, current_setting('test.m')), 'suppression d''un membre');
select throws_ok($$ insert into public.members (assembly_id, kind, display_name)
  values (current_setting('test.ag')::uuid, 'person', 'X') $$, '42501', null, 'pas d''INSERT direct sur members');
reset role;

-- ----- Intégrité : une voix ne peut pas pointer une clé d'une autre AG -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag2', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGE', 'age', 'company',
  'sa', '2026-06-15 16:00')::text, true);
reset role;
select throws_ok(format($$ insert into public.member_weights (member_id, weight_key_id, assembly_id, weight)
  values ((select id from public.members where external_ref = 'Z1'),
          (select id from public.weight_keys where assembly_id = %L), %L, 1) $$,
  current_setting('test.ag2'), current_setting('test.ag')),
  '23503', null, 'clé étrangère composite : pas de voix sur la clé d''une autre AG');

-- ----- Isolation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is_empty($$ select 1 from public.members union all select 1 from public.member_weights $$,
  'une autre organisation ne voit aucun membre ni aucune voix');
select is_empty($$ select 1 from public.weight_key_totals $$, 'ni les totaux');
select throws_ok(format($$ select public.import_members(%L, '[{"last_name": "X"}]', 'append', false) $$,
  current_setting('test.ag')), 'P0001', 'not_found', 'une autre organisation ne peut pas importer');
reset role;

-- ----- Verrouillage en séance -----
update public.assemblies set status = 'in_session' where id = current_setting('test.ag')::uuid;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.import_members(%L, '[{"last_name": "X"}]', 'append', true) $$,
  current_setting('test.ag')), 'P0001', 'assembly_locked', 'en séance : import verrouillé');
select throws_ok(format($$ select public.delete_member((select id from public.members where external_ref = 'Z1')) $$),
  'P0001', 'assembly_locked', 'en séance : suppression verrouillée');
reset role;

-- ----- Audit -----
select is(private.verify_audit_chain_unchecked(current_setting('test.ag')::uuid) ->> 'ok', 'true', 'chaîne intègre');
select is((select payload -> 'source' ->> 'filename' from public.audit_log
           where chain_id = current_setting('test.ag')::uuid and action = 'members.imported' order by seq limit 1),
  'associes.csv', 'le fichier source est tracé');
select results_eq(format($$ select action from public.audit_log where chain_id = %L and action like 'member%%' order by seq $$,
  current_setting('test.ag')),
  array['members.imported', 'members.imported', 'members.imported', 'member.created', 'member.updated', 'member.deleted'],
  'imports et éditions tracés ; imports refusés ou à blanc non tracés');

select * from finish();
rollback;
