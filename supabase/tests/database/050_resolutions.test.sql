-- Résolutions : numérotation, sous-résolutions, règles, versions et motifs, réorganisation,
-- suppression, pièces jointes (Storage), isolation, verrouillage et audit.
begin;
select plan(53);

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

-- Données d'une résolution (majorité SA/AGO par défaut).
create function pg_temp.res(p_title text, p_parent text default null, p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object(
    'title', p_title,
    'parent_id', p_parent,
    'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "L''assemblée approuve"}, {"type": "text", "text": "les comptes."}]}]}'::jsonb,
    'weight_key_id', (select id from public.weight_keys where assembly_id = current_setting('test.ag')::uuid and code = 'voix'),
    'vote_type', 'yes_no_abstain',
    'majority_rule', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}], "preset": "sa_ago"}'::jsonb,
    'abstention_policy', 'excluded',
    'quorum_rule', null,
    'is_secret', false) || p_extra;
$$;
grant execute on function pg_temp.res(text, text, jsonb) to authenticated;

create function pg_temp.numbers() returns text language sql as $$
  select string_agg(number || '=' || title, ', ' order by number)
  from public.resolutions where assembly_id = current_setting('test.ag')::uuid;
$$;
grant execute on function pg_temp.numbers() to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGO', 'ago', 'company',
  'sa', '2026-06-15 14:00')::text, true);
select set_config('test.ag2', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AGE', 'age', 'company',
  'sa', '2026-06-15 16:00')::text, true);
select public.upsert_weight_key(current_setting('test.ag')::uuid, null, 'pref', 'Actions de préférence', null, false);

-- ----- Création et numérotation -----
select set_config('test.r1', public.upsert_resolution(current_setting('test.ag')::uuid, null, pg_temp.res('Comptes'))::text, true);
select set_config('test.r2', public.upsert_resolution(current_setting('test.ag')::uuid, null, pg_temp.res('Affectation'))::text, true);
select set_config('test.r3', public.upsert_resolution(current_setting('test.ag')::uuid, null, pg_temp.res('Quitus'))::text, true);
select set_config('test.r2a', public.upsert_resolution(current_setting('test.ag')::uuid, null,
  pg_temp.res('Dividende', current_setting('test.r2')))::text, true);
select set_config('test.r2b', public.upsert_resolution(current_setting('test.ag')::uuid, null,
  pg_temp.res('Report à nouveau', current_setting('test.r2')))::text, true);
select is(pg_temp.numbers(), '1=Comptes, 2=Affectation, 2.1=Dividende, 2.2=Report à nouveau, 3=Quitus',
  'numérotation automatique, sous-résolutions en 2.1, 2.2');
select is((select body_text from public.resolutions where id = current_setting('test.r1')::uuid),
  'L''assemblée approuve les comptes.', 'texte brut extrait du document');
select is((select count(*)::int from public.resolution_versions where resolution_id = current_setting('test.r1')::uuid),
  1, 'une version enregistrée à la création');

-- ----- Validation -----
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res('X', %L)) $$,
  current_setting('test.ag'), current_setting('test.r2a')), 'P0001', 'invalid_parent',
  'un seul niveau de sous-résolutions');
select throws_ok(format($$ select public.upsert_resolution(%L, %L, pg_temp.res('X', %L)) $$,
  current_setting('test.ag'), current_setting('test.r2'), current_setting('test.r1')), 'P0001', 'invalid_parent',
  'une résolution qui a des sous-résolutions ne devient pas elle-même sous-résolution');
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res('X', null, '{"majority_rule": null}')) $$,
  current_setting('test.ag')), 'P0001', 'invalid_majority_rule', 'un vote sans règle de majorité est refusé');
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res('X', null,
  '{"majority_rule": {"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 3, "den": 2, "comparison": "gt"}]}}')) $$,
  current_setting('test.ag')), 'P0001', 'invalid_majority_rule', 'seuil invalide refusé');
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res('X', null, '{"vote_type": "election"}')) $$,
  current_setting('test.ag')), 'P0001', 'vote_type_not_available', 'élections : pas au Lot 1');
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res('X', null,
  jsonb_build_object('weight_key_id', (select id from public.weight_keys where assembly_id = %L)))) $$,
  current_setting('test.ag'), current_setting('test.ag2')), 'P0001', 'invalid_weight_key',
  'clé d''une autre assemblée refusée');
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res(' ')) $$, current_setting('test.ag')),
  'P0001', 'invalid_title', 'titre vide refusé');
select throws_ok(format($$ select public.upsert_resolution(%L, null, pg_temp.res('X', null, '{"board_recommendation": "maybe"}')) $$,
  current_setting('test.ag')), 'P0001', 'invalid_resolution', 'recommandation du conseil invalide refusée');
select ok(set_config('test.info', public.upsert_resolution(current_setting('test.ag')::uuid, null,
  pg_temp.res('Rapport de gestion', null, '{"vote_type": "information"}'))::text, true) is not null,
  'question sans vote (information)');
select is((select majority_rule from public.resolutions where id = current_setting('test.info')::uuid), null::jsonb,
  'une information n''a pas de règle de majorité');
select ok(set_config('test.pref', public.upsert_resolution(current_setting('test.ag')::uuid, null,
  pg_temp.res('Vote des porteurs de préférence', null, jsonb_build_object(
    'weight_key_id', (select id from public.weight_keys where assembly_id = current_setting('test.ag')::uuid and code = 'pref'),
    'is_secret', true, 'board_recommendation', 'for',
    'quorum_rule', '{"conditions": [{"measure": "weight", "numerator": "present_represented", "base": "all_members", "num": 1, "den": 3, "comparison": "gte"}]}'::jsonb)))::text, true) is not null,
  'résolution sur une autre clé, à bulletin secret, avec quorum propre et avis du conseil');

-- ----- Mise à jour et versions -----
select throws_ok(format($$ select public.upsert_resolution(%L, %L, pg_temp.res('Comptes 2025'), 5) $$,
  current_setting('test.ag'), current_setting('test.r1')), 'P0001', 'version_conflict', 'version périmée refusée');
select lives_ok(format($$ select public.upsert_resolution(%L, %L, pg_temp.res('Approbation des comptes 2025'), 1) $$,
  current_setting('test.ag'), current_setting('test.r1')), 'modification en brouillon, sans motif');
select results_eq(format($$ select version, snapshot ->> 'title', reason from public.resolution_versions
  where resolution_id = %L order by version $$, current_setting('test.r1')),
  $$ values (1, 'Comptes'::text, null::text), (2, 'Approbation des comptes 2025', null) $$,
  'chaque version conserve un instantané complet');

-- ----- Réorganisation -----
select lives_ok(format($$ select public.reorder_resolutions(%L, null, array[%L, %L, %L, %L, %L]::uuid[]) $$,
  current_setting('test.ag'), current_setting('test.r3'), current_setting('test.r1'), current_setting('test.r2'),
  current_setting('test.info'), current_setting('test.pref')), 'réorganisation de l''ordre du jour');
select is(pg_temp.numbers(),
  '1=Quitus, 2=Approbation des comptes 2025, 3=Affectation, 3.1=Dividende, 3.2=Report à nouveau, 4=Rapport de gestion, 5=Vote des porteurs de préférence',
  'numéros recalculés, sous-résolutions comprises');
select lives_ok(format($$ select public.reorder_resolutions(%L, %L, array[%L, %L]::uuid[]) $$,
  current_setting('test.ag'), current_setting('test.r2'), current_setting('test.r2b'), current_setting('test.r2a')),
  'réorganisation des sous-résolutions');
select is((select number from public.resolutions where id = current_setting('test.r2b')::uuid), '3.1',
  'sous-résolution renumérotée');
select throws_ok(format($$ select public.reorder_resolutions(%L, null, array[%L, %L]::uuid[]) $$,
  current_setting('test.ag'), current_setting('test.r3'), current_setting('test.r1')),
  'P0001', 'invalid_order', 'une réorganisation incomplète est refusée');
select throws_ok(format($$ select public.reorder_resolutions(%L, null, array[%L, %L, %L, %L, %L]::uuid[]) $$,
  current_setting('test.ag'), current_setting('test.r3'), current_setting('test.r1'), current_setting('test.r2a'),
  current_setting('test.info'), current_setting('test.pref')),
  'P0001', 'invalid_order', 'une sous-résolution ne se mélange pas aux résolutions principales');
select is((select version from public.resolutions where id = current_setting('test.r3')::uuid), 1,
  'réordonner ne change pas la version (contenu inchangé)');

-- ----- Après convocation : motif obligatoire -----
select public.set_assembly_status(current_setting('test.ag')::uuid, 'convened', null);
select throws_ok(format($$ select public.upsert_resolution(%L, %L, pg_temp.res('Quitus aux administrateurs')) $$,
  current_setting('test.ag'), current_setting('test.r3')), 'P0001', 'reason_required',
  'après convocation, une modification sans motif est refusée');
select lives_ok(format($$ select public.upsert_resolution(%L, %L, pg_temp.res('Quitus aux administrateurs'), 1,
  'Erreur matérielle dans la convocation') $$, current_setting('test.ag'), current_setting('test.r3')),
  'modification motivée');
select results_eq(format($$ select assembly_status::text, reason from public.resolution_versions
  where resolution_id = %L and version = 2 $$, current_setting('test.r3')),
  $$ values ('convened'::text, 'Erreur matérielle dans la convocation'::text) $$,
  'la version porte le motif et le statut de l''AG au moment de la modification');
select ok(set_config('test.late', public.upsert_resolution(current_setting('test.ag')::uuid, null,
  pg_temp.res('Point ajouté'))::text, true) is not null, 'ajout après convocation possible (tracé)');

-- ----- Suppression -----
select throws_ok(format($$ select public.delete_resolution(%L, 'test') $$, current_setting('test.r2')),
  'P0001', 'has_children', 'une résolution avec sous-résolutions ne se supprime pas');
select throws_ok(format($$ select public.delete_resolution(%L) $$, current_setting('test.r2a')),
  'P0001', 'reason_required', 'après convocation, suppression motivée');
select lives_ok(format($$ select public.delete_resolution(%L, 'Retirée de l''ordre du jour') $$,
  current_setting('test.r2a')), 'suppression motivée');
select is((select number from public.resolutions where id = current_setting('test.r2b')::uuid), '3.1',
  'numérotation compacte après suppression');
select is((select change_kind || ':' || reason from public.resolution_versions
  where resolution_id = current_setting('test.r2a')::uuid and change_kind = 'deleted'),
  'deleted:Retirée de l''ordre du jour', 'l''historique survit à la suppression');
select throws_ok(format($$ select public.delete_weight_key((select id from public.weight_keys where assembly_id = %L and code = 'pref')) $$,
  current_setting('test.ag')), 'P0001', 'weight_key_in_use', 'une clé utilisée par une résolution ne se supprime pas');
reset role;

select throws_ok($$ update public.resolution_versions set reason = 'falsifié' $$, 'P0001', 'append_only',
  'historique des versions en ajout seul');
select throws_ok($$ delete from public.resolution_versions $$, 'P0001', 'append_only',
  'historique des versions non supprimable');

-- ----- Pièces jointes et politiques Storage -----
select set_config('test.path', current_setting('test.ag') || '/' || current_setting('test.r1') || '/rapport.pdf', true);
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{"size": 1000}') $$,
  current_setting('test.path')), '42501', null, 'une autre organisation ne dépose pas de fichier');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{"size": 1000}') $$,
  current_setting('test.ag') || '/' || gen_random_uuid() || '/x.pdf'), '42501', null,
  'dépôt refusé si la résolution n''appartient pas à l''AG du chemin');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{"size": 1000}') $$,
  current_setting('test.path')), 'l''organisatrice dépose un PDF');
select throws_ok(format($$ select public.add_resolution_attachment(%L, %L, 'rapport.pdf') $$,
  current_setting('test.r1'), current_setting('test.ag') || '/' || current_setting('test.r1') || '/absent.pdf'),
  'P0001', 'attachment_not_uploaded', 'un fichier non déposé ne s''enregistre pas');
select throws_ok(format($$ select public.add_resolution_attachment(%L, %L, 'rapport.pdf') $$,
  current_setting('test.r3'), current_setting('test.path')), 'P0001', 'invalid_attachment',
  'le chemin doit correspondre à la résolution');
select ok(set_config('test.att', public.add_resolution_attachment(current_setting('test.r1')::uuid,
  current_setting('test.path'), 'Rapport de gestion.pdf')::text, true) is not null, 'pièce jointe enregistrée');
select is((select size_bytes from public.resolution_attachments where id = current_setting('test.att')::uuid), 1000::bigint,
  'taille lue depuis Storage, pas déclarée par le client');
-- Comme l'API Storage : suppression autorisée au niveau SQL, puis soumise à la RLS.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = current_setting('test.path');
select is((select count(*)::int from storage.objects where name = current_setting('test.path')), 1,
  'un fichier référencé ne peut pas être supprimé de Storage');
select is(public.remove_resolution_attachment(current_setting('test.att')::uuid), current_setting('test.path'),
  'retrait de la pièce jointe');
delete from storage.objects where name = current_setting('test.path');
select is((select count(*)::int from storage.objects where name = current_setting('test.path')), 0,
  'le fichier non référencé peut alors être supprimé');
reset role;

-- ----- Isolation -----
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is_empty($$ select 1 from public.resolutions union all select 1 from public.resolution_versions $$,
  'une autre organisation ne voit ni les résolutions ni leur historique');
select throws_ok(format($$ select public.upsert_resolution(%L, null, '{"title": "X"}') $$, current_setting('test.ag')),
  'P0001', 'not_found', 'une autre organisation ne crée pas de résolution');
select throws_ok($$ insert into public.resolutions (assembly_id, position, title, weight_key_id)
  values (gen_random_uuid(), 1, 'X', gen_random_uuid()) $$, '42501', null, 'pas d''INSERT direct');
reset role;

-- ----- Verrouillage en séance -----
update public.assemblies set status = 'in_session' where id = current_setting('test.ag')::uuid;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select public.upsert_resolution(%L, %L, pg_temp.res('X'), null, 'motif') $$,
  current_setting('test.ag'), current_setting('test.r1')), 'P0001', 'assembly_locked', 'en séance : verrouillé');
select throws_ok(format($$ select public.reorder_resolutions(%L, null, array[]::uuid[]) $$, current_setting('test.ag')),
  'P0001', 'assembly_locked', 'en séance : ordre du jour figé');
reset role;

-- ----- Audit -----
select is(private.verify_audit_chain_unchecked(current_setting('test.ag')::uuid) ->> 'ok', 'true', 'chaîne intègre');
select results_eq(format($$ select action, count(*)::int from public.audit_log where chain_id = %L
    and action like 'resolution%%' group by action order by action $$, current_setting('test.ag')),
  $$ values ('resolution.attachment_added'::text, 1), ('resolution.attachment_removed', 1), ('resolution.created', 8),
            ('resolution.deleted', 1), ('resolution.updated', 2), ('resolutions.reordered', 2) $$,
  'chaque opération sur les résolutions est tracée, les tentatives refusées ne le sont pas');

select * from finish();
rollback;
