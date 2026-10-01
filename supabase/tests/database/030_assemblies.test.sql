-- Assemblées : création avec presets, paramétrage, versions, statut, verrouillage,
-- clés de répartition, bureau, isolation et audit.
begin;
select plan(53);

-- ----- Fixtures -----
-- A1 admin org A · A2 organisatrice org A · B1 admin org B · N sans organisation
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@org-a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test'),
  ('00000000-0000-0000-0000-0000000000ff', 'n@nowhere.test');
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'org_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'org_admin');

create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ----- Création et presets par défaut -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select ok(set_config('test.sa', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000',
  'AGO 2026', 'ago', 'company', 'sa', '2026-06-15 14:00', 'Europe/Paris', 'Siège')::text, true) is not null,
  'une organisatrice crée une AG de SA');
select ok(set_config('test.sarl', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000',
  'AGE SARL', 'age', 'company', 'sarl', '2026-06-16 10:00', 'Europe/Paris', null)::text, true) is not null,
  'AGE de SARL créée');
select ok(set_config('test.asso', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000',
  'AG annuelle', 'ago', 'association', '', '2026-06-17 18:30', 'Europe/Paris', null)::text, true) is not null,
  'AG d''association créée (forme vide ignorée)');
reset role;

select is((select quorum_rule ->> 'preset' from public.assemblies where id = current_setting('test.sa')::uuid),
  'sa_ago_q1', 'SA/AGO : quorum 1/5 en 1re convocation par défaut');
select is((select proxy_rules ->> 'blank_to' from public.assemblies where id = current_setting('test.sa')::uuid),
  'board_recommendation', 'SA : pouvoir en blanc selon l''avis du conseil (B7)');
select is((select quorum_rule ->> 'preset' from public.assemblies where id = current_setting('test.sarl')::uuid),
  'sarl_age_q1', 'SARL/AGE : quorum 1/4 par défaut');
select is((select quorum_rule ->> 'preset' from public.assemblies where id = current_setting('test.asso')::uuid),
  'none', 'association : pas de quorum par défaut (statuts)');
select is((select proxy_rules ->> 'blank_to' from public.assemblies where id = current_setting('test.asso')::uuid),
  'president', 'association : pouvoir en blanc au président');
select is((select settings from public.assemblies where id = current_setting('test.sa')::uuid),
  private.default_settings(), 'réglages de séance par défaut');
select is((select starts_at from public.assemblies where id = current_setting('test.sa')::uuid),
  '2026-06-15 12:00:00+00'::timestamptz, 'heure locale convertie selon le fuseau de l''AG (CEST)');
select results_eq(
  format($$ select code, is_primary from public.weight_keys where assembly_id = %L $$, current_setting('test.sa')),
  $$ values ('voix'::text, true) $$, 'une clé principale « voix » est créée');

-- ----- Droits et validation à la création -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'ago', 'company', 'sa',
  '2026-01-01 10:00') $$, 'P0001', 'forbidden', 'un admin d''une autre organisation ne crée pas d''AG');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000ff');
select throws_ok($$ select public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'ago', 'company', 'sa',
  '2026-01-01 10:00') $$, 'P0001', 'forbidden', 'un compte sans organisation ne crée pas d''AG');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'ago', 'company', 'sa',
  '2026-01-01 10:00', 'Mars/Olympus') $$, 'P0001', 'invalid_timezone', 'fuseau inconnu refusé');
select throws_ok($$ select public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'ago', 'association', 'sa',
  '2026-01-01 10:00') $$, 'P0001', 'invalid_legal_form', 'une forme sociale n''a de sens que pour une société');
select throws_ok($$ select public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', '  ', 'ago', 'company', 'sa',
  '2026-01-01 10:00') $$, 'P0001', 'invalid_title', 'titre vide refusé');
select throws_ok($$ insert into public.assemblies (org_id, title, type, legal_family, starts_at, proxy_rules, created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'ago', 'other', now(), '{}', auth.uid()) $$,
  '42501', null, 'pas d''INSERT direct sur assemblies');
reset role;

-- ----- Isolation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is_empty($$ select 1 from public.assemblies $$, 'B1 ne voit aucune AG de l''org A');
select is_empty($$ select 1 from public.weight_keys $$, 'B1 ne voit aucune clé de l''org A');
select throws_ok(format($$ select public.update_assembly_info(%L, 1, 'Piratée', 'ago', 'company', 'sa',
  '2026-06-15 14:00', 'Europe/Paris', null) $$, current_setting('test.sa')),
  'P0001', 'not_found', 'B1 ne peut pas modifier une AG de l''org A (sans en révéler l''existence)');
select ok((select count(*) from public.rule_presets) > 10, 'les presets sont lisibles par tout utilisateur connecté');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select results_eq($$ select count(*)::int from public.assemblies $$, array[3], 'l''admin de l''org A voit ses 3 AG');
reset role;

-- ----- Mise à jour avec contrôle de version -----
-- Les helpers privés ne sont pas exécutables par les utilisateurs : valeurs préparées ici.
select set_config('test.defaults', private.default_settings()::text, true);
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.update_assembly_info(%L, 7, 'AGO 2026 bis', 'ago', 'company', 'sa',
  '2026-06-15 15:00', 'Europe/Paris', 'Siège') $$, current_setting('test.sa')),
  'P0001', 'version_conflict', 'une version périmée est refusée (modification concurrente)');
select is(public.update_assembly_info(current_setting('test.sa')::uuid, 1, 'AGO 2026 bis', 'mixed', 'company', 'sa',
  '2026-06-15 15:00', 'Europe/Paris', 'Siège'), 2, 'la mise à jour incrémente la version');
select throws_ok(format($$ select public.update_assembly_rules(%L, 2,
  '{"conditions": [{"measure": "weight", "numerator": "for", "base": "all_members", "num": 1, "den": 5, "comparison": "gte"}]}',
  (select proxy_rules from public.assemblies where id = %L), current_setting('test.defaults')::jsonb) $$,
  current_setting('test.sa'), current_setting('test.sa')),
  'P0001', 'invalid_quorum_rule', 'une règle de quorum invalide est refusée');
select throws_ok(format($$ select public.update_assembly_rules(%L, 2, null,
  (select proxy_rules from public.assemblies where id = %L),
  '{"allow_vote_change": null, "departure_during_ballot": "freeze", "hide_live_trend": true, "single_open_ballot": true}') $$,
  current_setting('test.sa'), current_setting('test.sa')),
  'P0001', 'invalid_settings', 'un réglage à null est refusé');
select is(public.update_assembly_rules(current_setting('test.sa')::uuid, 2,
  (select params from public.rule_presets where code = 'sa_age_q1'),
  (select params from public.rule_presets where code = 'unlimited'),
  current_setting('test.defaults')::jsonb || '{"allow_vote_change": false}'), 3, 'règles mises à jour');
select is((select settings ->> 'allow_vote_change' from public.assemblies where id = current_setting('test.sa')::uuid),
  'false', 'le réglage est enregistré');
reset role;

-- La contrainte CHECK refuse elle aussi un réglage à null (piège NULL des CHECK).
select throws_ok(format($$ update public.assemblies set settings = settings || '{"hide_live_trend": null}' where id = %L $$,
  current_setting('test.sa')), '23514', null, 'CHECK : un réglage à null est refusé');

-- ----- Clés de répartition -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.upsert_weight_key(%L, null, 'Droits Doubles', 'Droits doubles', null, false) $$,
  current_setting('test.sa')), 'P0001', 'invalid_code', 'code de clé invalide refusé');
select throws_ok(format($$ select public.upsert_weight_key(%L, null, 'voix', 'Doublon', null, false) $$,
  current_setting('test.sa')), 'P0001', 'code_taken', 'code de clé déjà pris refusé');
select throws_ok(format($$ select public.upsert_weight_key(%L, null, 'capital', 'Capital', 0, false) $$,
  current_setting('test.sa')), 'P0001', 'invalid_total', 'total déclaré nul refusé');
select ok(set_config('test.key', public.upsert_weight_key(current_setting('test.sa')::uuid, null, 'droits_vote',
  'Droits de vote (dont doubles)', 1500000, true)::text, true) is not null, 'nouvelle clé principale créée');
select results_eq(format($$ select code from public.weight_keys where assembly_id = %L and is_primary $$,
  current_setting('test.sa')), array['droits_vote'], 'une seule clé principale : l''ancienne est rétrogradée');
select throws_ok(format($$ select public.upsert_weight_key(%L, %L, 'droits_vote', 'Droits de vote', 1500000, false) $$,
  current_setting('test.sa'), current_setting('test.key')),
  'P0001', 'primary_key_required', 'on ne retire pas le statut principal sans en désigner une autre');
select throws_ok(format($$ select public.delete_weight_key(%L) $$, current_setting('test.key')),
  'P0001', 'primary_key_required', 'la clé principale ne se supprime pas');
select lives_ok(format($$ select public.delete_weight_key((select id from public.weight_keys where assembly_id = %L and code = 'voix')) $$,
  current_setting('test.sa')), 'une clé secondaire se supprime');
reset role;

-- ----- Statut -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select is(public.set_assembly_status(current_setting('test.sa')::uuid, 'convened', null), 4, 'brouillon → convoquée (les clés ne changent pas la version de l''AG)');
select throws_ok(format($$ select public.set_assembly_status(%L, 'in_session') $$, current_setting('test.sa')),
  'P0001', 'no_members', 'pas de passage en séance sans participants');
select throws_ok(format($$ select public.set_assembly_status(%L, 'archived') $$, current_setting('test.asso')),
  'P0001', 'transition_not_available', 'transition interdite : brouillon → archivée');
select lives_ok(format($$ select public.set_assembly_status(%L, 'draft', 'Erreur de date') $$, current_setting('test.sa')),
  'convoquée → brouillon, avec motif');
reset role;

-- ----- Verrouillage en séance (SPEC §5.9) -----
update public.assemblies set status = 'in_session' where id = current_setting('test.sa')::uuid;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.update_assembly_info(%L, 5, 'X', 'ago', 'company', 'sa',
  '2026-06-15 15:00', 'Europe/Paris', null) $$, current_setting('test.sa')),
  'P0001', 'assembly_locked', 'en séance : informations verrouillées');
select throws_ok(format($$ select public.upsert_weight_key(%L, null, 'autre', 'Autre', null, false) $$,
  current_setting('test.sa')), 'P0001', 'assembly_locked', 'en séance : clés de répartition verrouillées');
reset role;
update public.assemblies set status = 'closed' where id = current_setting('test.sa')::uuid;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.assign_assembly_staff(%L, '00000000-0000-0000-0000-0000000000a1', 'president') $$,
  current_setting('test.sa')), 'P0001', 'assembly_locked', 'AG close : le bureau n''est plus modifiable');
reset role;

-- ----- Bureau et accueil -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format($$ select public.assign_assembly_staff(%L, '00000000-0000-0000-0000-0000000000a1', 'president') $$,
  current_setting('test.asso')), 'une organisatrice désigne le président de séance');
select lives_ok(format($$ select public.assign_assembly_staff(%L, '00000000-0000-0000-0000-0000000000a1', 'president') $$,
  current_setting('test.asso')), 'désignation idempotente');
select throws_ok(format($$ select public.assign_assembly_staff(%L, '00000000-0000-0000-0000-0000000000b1', 'reception') $$,
  current_setting('test.asso')), 'P0001', 'not_org_member', 'seuls les membres de l''organisation sont désignables');
select results_eq(format($$ select count(*)::int from public.assembly_staff where assembly_id = %L $$,
  current_setting('test.asso')), array[1], 'le bureau est lisible');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$ select public.remove_assembly_staff(%L, '00000000-0000-0000-0000-0000000000a1', 'president') $$,
  current_setting('test.asso')), 'P0001', 'not_found', 'une autre organisation ne retire personne');
reset role;
select is(private.has_assembly_role(current_setting('test.asso')::uuid, array['president']::public.staff_role[]), false,
  'sans session, aucun rôle de séance');

-- ----- Audit -----
select is(private.verify_audit_chain_unchecked(current_setting('test.sa')::uuid) ->> 'ok', 'true',
  'la chaîne d''audit de l''AG est intègre');
select results_eq(format($$ select action from public.audit_log where chain_id = %L order by seq $$, current_setting('test.sa')),
  array['assembly.created', 'assembly.info_updated', 'assembly.rules_updated', 'weight_key.created',
        'weight_key.deleted', 'assembly.status_changed', 'assembly.status_changed'],
  'chaque action de préparation est tracée, les tentatives refusées ne laissent pas de trace');
select is((select payload ->> 'reason' from public.audit_log where chain_id = current_setting('test.sa')::uuid
           and action = 'assembly.status_changed' order by seq desc limit 1), 'Erreur de date',
  'le motif du changement de statut est conservé');

select * from finish();
rollback;
