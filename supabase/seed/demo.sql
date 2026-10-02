-- Données de démonstration (plan T16) : une organisation, trois assemblées convoquées, prêtes
-- pour l'accueil, la régie et le vote.
--   · Société Démo SA — AGO : 40 actionnaires, pouvoirs en blanc selon l'avis du conseil ;
--   · Résidence Les Tilleuls — AG de copropriété : 120 lots, 3 clés de répartition, règles de
--     majorité des articles 24, 25 et 26 (à valider juridiquement), plafond de pouvoirs 3 OU 10 % ;
--   · Association Démo — AG : 1 500 adhérents, quorum d'un quart, 2 pouvoirs par mandataire.
-- Tout passe par les RPC (mêmes contrôles, même journal d'audit qu'en usage réel). Données
-- déterministes.
--
-- Compte : par défaut demo@mobag.local (lien magique visible dans Mailpit, en local). Sur un
-- projet hébergé, passer sa propre adresse (le compte est créé s'il n'existe pas encore) :
--   npm run db:demo                                              (local)
--   psql "<chaîne de connexion>" -v email=prenom.nom@exemple.fr -f supabase/seed/demo.sql

\set ON_ERROR_STOP on
\if :{?email}
\else
  \set email demo@mobag.local
\endif
\set QUIET on
\o /dev/null
begin;

do $$
begin
  if exists (select 1 from public.organizations where slug = 'demo-mobilactif') then
    raise exception 'Les données de démonstration existent déjà. Réinitialisez la base : npx supabase db reset';
  end if;
end;
$$;

-- ===== Compte de démonstration (créé s'il n'existe pas) =====
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', lower(:'email'),
       now(), '{"full_name": "Compte de démonstration"}', '', '', '', '', now(), now()
where not exists (select 1 from auth.users where email = lower(:'email'));
select set_config('demo.user', (select id from auth.users where email = lower(:'email') limit 1)::text, true);

insert into public.organizations (id, name, slug)
values ('d0000000-0000-4000-8000-0000000000aa', 'MobilActif — Démonstration', 'demo-mobilactif');
insert into public.org_members (org_id, user_id, role)
values ('d0000000-0000-4000-8000-0000000000aa', current_setting('demo.user')::uuid, 'org_admin');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('demo.user'), 'role', 'authenticated')::text, true);

-- ===== Outils =====
create function pg_temp.name(i int) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'last_name', (array['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
                        'Simon','Laurent','Lefèvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier',
                        'Morel','Girard','André','Lefèvre','Mercier','Dupont','Lambert','Bonnet','François','Martinez'])[1 + i % 30],
    'first_name', (array['Camille','Léa','Hugo','Chloé','Louis','Manon','Jules','Inès','Gabriel','Zoé',
                         'Arthur','Jade','Raphaël','Louise','Adam','Emma','Paul','Alice','Nathan','Lina'])[1 + (i * 7) % 20]) $$;

create function pg_temp.doc(p_text text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph',
    'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_text))))) $$;

create function pg_temp.rule(p_preset text) returns jsonb language sql stable as $$
  select params from public.rule_presets where code = p_preset and kind = 'majority' $$;

create function pg_temp.key(p_assembly uuid, p_code text) returns uuid language sql stable as $$
  select id from public.weight_keys where assembly_id = p_assembly and code = p_code $$;

create function pg_temp.member(p_assembly uuid, p_ref text) returns uuid language sql stable as $$
  select id from public.members where assembly_id = p_assembly and external_ref = p_ref $$;

create function pg_temp.resolution(p_assembly uuid, p_title text, p_text text, p_key text, p_rule jsonb,
                                   p_extra jsonb default '{}') returns uuid language sql as $$
  select public.upsert_resolution(p_assembly, null, jsonb_build_object(
    'title', p_title, 'parent_id', null, 'body', pg_temp.doc(p_text),
    'weight_key_id', pg_temp.key(p_assembly, p_key),
    'vote_type', case when p_rule is null then 'information' else 'yes_no_abstain' end,
    'majority_rule', p_rule, 'abstention_policy', 'excluded', 'quorum_rule', null, 'is_secret', false) || p_extra) $$;

-- Personne attendue qui porte un membre en propre.
create function pg_temp.attendee(p_assembly uuid, p_ref text) returns uuid language sql as $$
  select public.upsert_attendee(p_assembly, null,
    case when m.kind = 'legal_entity' then coalesce(m.representative_name, m.display_name) else m.display_name end,
    null, null, array[m.id], false)
  from public.members m where m.assembly_id = p_assembly and m.external_ref = p_ref $$;

create function pg_temp.staff(p_assembly uuid) returns void language sql as $$
  select public.assign_assembly_staff(p_assembly, current_setting('demo.user')::uuid, r)
  from unnest(array['president', 'secretary', 'reception']::public.staff_role[]) r $$;

-- ===== 1. Société Démo SA — AGO (priorité 1 : sociétés) =====
select set_config('demo.sa', public.create_assembly('d0000000-0000-4000-8000-0000000000aa',
  'Société Démo SA — Assemblée générale ordinaire 2026', 'ago', 'company', 'sa', '2026-06-15 14:00')::text, true);
select public.import_members(current_setting('demo.sa')::uuid, (
  select jsonb_agg(case
      when i % 8 = 0 then jsonb_build_object('external_ref', 'ACT' || lpad(i::text, 3, '0'),
        'company_name', (array['Holding Atlas','Finance Horizon','SCI du Port','Capital Alpin','Invest Ouest'])[1 + (i / 8) % 5],
        'representative_name', (pg_temp.name(i) ->> 'first_name') || ' ' || (pg_temp.name(i) ->> 'last_name'),
        'weights', jsonb_build_object('voix', 4000 + i * 100))
      else pg_temp.name(i) || jsonb_build_object('external_ref', 'ACT' || lpad(i::text, 3, '0'),
        'email', 'actionnaire' || i || '@exemple.fr', 'weights', jsonb_build_object('voix', 100 + (i * 137) % 900))
    end order by i)
  from generate_series(1, 40) i), 'append', false);
select public.upsert_weight_key(current_setting('demo.sa')::uuid, pg_temp.key(current_setting('demo.sa')::uuid, 'voix'),
  'voix', 'Actions', (select sum(weight) from public.member_weights where assembly_id = current_setting('demo.sa')::uuid), true);
select pg_temp.resolution(current_setting('demo.sa')::uuid, 'Approbation des comptes de l''exercice 2025',
  'L''assemblée générale, après avoir pris connaissance des rapports du conseil d''administration et du commissaire aux comptes, approuve les comptes annuels de l''exercice clos le 31 décembre 2025.',
  'voix', pg_temp.rule('sa_ago'), '{"board_recommendation": "for"}');
select pg_temp.resolution(current_setting('demo.sa')::uuid, 'Affectation du résultat',
  'L''assemblée générale décide d''affecter le bénéfice de l''exercice au compte de report à nouveau.',
  'voix', pg_temp.rule('sa_ago'), '{"board_recommendation": "for"}');
select pg_temp.resolution(current_setting('demo.sa')::uuid, 'Renouvellement du mandat d''un administrateur',
  'L''assemblée générale renouvelle le mandat d''administrateur de Mme Léa Bernard pour une durée de six ans.',
  'voix', pg_temp.rule('sa_ago'), '{"board_recommendation": "for"}');
select pg_temp.resolution(current_setting('demo.sa')::uuid, 'Projet de résolution présenté par un actionnaire',
  'L''assemblée générale décide de distribuer un dividende exceptionnel de 2 euros par action.',
  'voix', pg_temp.rule('sa_ago'), '{"board_recommendation": "against"}');
select pg_temp.attendee(current_setting('demo.sa')::uuid, 'ACT' || lpad(i::text, 3, '0')) from generate_series(1, 30) i;
select public.set_president(current_setting('demo.sa')::uuid,
  (select attendee_id from public.attendee_members where member_id = pg_temp.member(current_setting('demo.sa')::uuid, 'ACT001')));
select public.grant_proxy(current_setting('demo.sa')::uuid, pg_temp.member(current_setting('demo.sa')::uuid, 'ACT' || lpad(i::text, 3, '0')),
  null, 'blank') from generate_series(31, 35) i;
select public.grant_proxy(current_setting('demo.sa')::uuid, pg_temp.member(current_setting('demo.sa')::uuid, 'ACT' || lpad(i::text, 3, '0')),
  (select attendee_id from public.attendee_members where member_id = pg_temp.member(current_setting('demo.sa')::uuid, 'ACT00' || (i - 34))),
  'named') from generate_series(36, 39) i;
select pg_temp.staff(current_setting('demo.sa')::uuid);
select public.set_assembly_status(current_setting('demo.sa')::uuid, 'convened', null);

-- ===== 2. Association Démo — 1 500 adhérents (priorité 2) =====
select set_config('demo.asso', public.create_assembly('d0000000-0000-4000-8000-0000000000aa',
  'Association Démo — Assemblée générale 2026', 'ago', 'association', '', '2026-06-20 10:00')::text, true);
select public.import_members(current_setting('demo.asso')::uuid, (
  select jsonb_agg(pg_temp.name(i) || jsonb_build_object('external_ref', 'ADH' || lpad(i::text, 4, '0'),
    'email', 'adherent' || i || '@exemple.fr', 'weights', jsonb_build_object('voix', 1)) order by i)
  from generate_series(1, 1500) i), 'append', false);
select public.update_assembly_rules(current_setting('demo.asso')::uuid,
  (select version from public.assemblies where id = current_setting('demo.asso')::uuid),
  (select params from public.rule_presets where code = 'heads_quarter'),
  (select params from public.rule_presets where code = 'asso_cap_2'),
  '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}');
select pg_temp.resolution(current_setting('demo.asso')::uuid, 'Rapport moral', 'L''assemblée approuve le rapport moral présenté par la présidente.', 'voix', pg_temp.rule('asso_simple'));
select pg_temp.resolution(current_setting('demo.asso')::uuid, 'Rapport financier', 'L''assemblée approuve les comptes de l''exercice et donne quitus au trésorier.', 'voix', pg_temp.rule('asso_simple'));
select pg_temp.resolution(current_setting('demo.asso')::uuid, 'Montant de la cotisation 2027', 'L''assemblée fixe la cotisation annuelle à 30 euros.', 'voix', pg_temp.rule('asso_simple'));
select pg_temp.resolution(current_setting('demo.asso')::uuid, 'Modification des statuts', 'L''assemblée adopte les statuts modifiés joints à la convocation.', 'voix', pg_temp.rule('asso_2_3'));
-- 60 mandataires (adhérents 1 à 60), chacun porteur de deux pouvoirs (adhérents 61 à 180).
select pg_temp.attendee(current_setting('demo.asso')::uuid, 'ADH' || lpad(i::text, 4, '0')) from generate_series(1, 60) i;
select public.grant_proxy(current_setting('demo.asso')::uuid, pg_temp.member(current_setting('demo.asso')::uuid, 'ADH' || lpad(i::text, 4, '0')),
  (select attendee_id from public.attendee_members
   where member_id = pg_temp.member(current_setting('demo.asso')::uuid, 'ADH' || lpad((1 + (i - 61) / 2)::text, 4, '0'))),
  'named') from generate_series(61, 180) i;
select pg_temp.staff(current_setting('demo.asso')::uuid);
select public.set_assembly_status(current_setting('demo.asso')::uuid, 'convened', null);

-- ===== 3. Résidence Les Tilleuls — copropriété de 120 lots (priorité 3) =====
-- Règles de majorité des articles 24, 25 et 26 de la loi du 10 juillet 1965, saisies comme
-- règles personnalisées (à valider juridiquement avant tout usage réel).
select set_config('demo.copro', public.create_assembly('d0000000-0000-4000-8000-0000000000aa',
  'Résidence Les Tilleuls — Assemblée générale 2026', 'ago', 'copro', '', '2026-06-25 18:30')::text, true);
select public.upsert_weight_key(current_setting('demo.copro')::uuid, pg_temp.key(current_setting('demo.copro')::uuid, 'voix'),
  'generales', 'Charges générales', null, true);
select public.upsert_weight_key(current_setting('demo.copro')::uuid, null, 'ascenseur', 'Ascenseur (bât. A)', null, false);
select public.upsert_weight_key(current_setting('demo.copro')::uuid, null, 'batiment_b', 'Bâtiment B', null, false);
select public.import_members(current_setting('demo.copro')::uuid, (
  select jsonb_agg(case
      when i % 15 = 0 then jsonb_build_object('external_ref', 'LOT' || lpad(i::text, 3, '0'),
        'company_name', 'SCI ' || (array['Les Pins','Horizon','Belle Vue','Le Clos'])[1 + (i / 15) % 4],
        'representative_name', (pg_temp.name(i) ->> 'first_name') || ' ' || (pg_temp.name(i) ->> 'last_name'))
      else pg_temp.name(i + 3) || jsonb_build_object('external_ref', 'LOT' || lpad(i::text, 3, '0'))
    end || jsonb_build_object('weights', jsonb_build_object(
      'generales', 50 + (i * 37) % 60,
      'ascenseur', case when i <= 60 then 5 + (i * 13) % 20 else 0 end,
      'batiment_b', case when i > 60 then 10 + (i * 11) % 15 else 0 end)) order by i)
  from generate_series(1, 120) i), 'append', false);
select public.upsert_weight_key(current_setting('demo.copro')::uuid, k.id, k.code, k.label,
  (select sum(weight) from public.member_weights where weight_key_id = k.id), k.is_primary)
from public.weight_keys k where k.assembly_id = current_setting('demo.copro')::uuid;
select public.update_assembly_rules(current_setting('demo.copro')::uuid,
  (select version from public.assemblies where id = current_setting('demo.copro')::uuid), null,
  '{"max_count": 3, "max_share": {"num": 10, "den": 100}, "share_key": "primary", "combine": "or", "forbid_subdelegation": true, "blank_to": "president", "allow_transfer_on_departure": true}',
  '{"allow_vote_change": true, "departure_during_ballot": "transfer_unvoted", "hide_live_trend": true, "single_open_ballot": true}');
select set_config('demo.art24', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "expressed", "num": 1, "den": 2, "comparison": "gt"}]}', true);
select set_config('demo.art25', '{"conditions": [{"measure": "weight", "numerator": "for", "base": "all_members", "num": 1, "den": 2, "comparison": "gt"}]}', true);
select set_config('demo.art26', '{"conditions": [{"measure": "heads", "numerator": "for", "base": "all_members", "num": 1, "den": 2, "comparison": "gt"}, {"measure": "weight", "numerator": "for", "base": "all_members", "num": 2, "den": 3, "comparison": "gte"}]}', true);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Élection du président de séance', 'L''assemblée désigne le président de séance.', 'generales', current_setting('demo.art24')::jsonb);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Approbation des comptes de l''exercice', 'L''assemblée approuve les comptes de l''exercice 2025 tels que présentés par le syndic.', 'generales', current_setting('demo.art24')::jsonb);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Budget prévisionnel 2027', 'L''assemblée vote le budget prévisionnel de l''exercice 2027 pour un montant de 85 000 euros.', 'generales', current_setting('demo.art24')::jsonb);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Remplacement de l''ascenseur du bâtiment A', 'L''assemblée décide le remplacement de l''ascenseur, pour un montant de 62 000 euros réparti selon la clé « Ascenseur ».', 'ascenseur', current_setting('demo.art25')::jsonb);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Ravalement de la façade du bâtiment B', 'L''assemblée décide le ravalement de la façade du bâtiment B.', 'batiment_b', current_setting('demo.art24')::jsonb);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Modification du règlement de copropriété', 'L''assemblée adopte la modification de l''article 12 du règlement de copropriété (usage des parties communes).', 'generales', current_setting('demo.art26')::jsonb);
select pg_temp.resolution(current_setting('demo.copro')::uuid, 'Point d''information : procédures en cours', 'Le syndic informe l''assemblée de l''état des procédures de recouvrement.', 'generales', null);
select pg_temp.attendee(current_setting('demo.copro')::uuid, 'LOT' || lpad(i::text, 3, '0')) from generate_series(1, 70) i;
-- Le syndic, non copropriétaire, ne peut pas recevoir de pouvoir.
select public.upsert_attendee(current_setting('demo.copro')::uuid, null, 'Cabinet Syndic Démo', 'syndic@exemple.fr', null, null, true);
select public.grant_proxy(current_setting('demo.copro')::uuid, pg_temp.member(current_setting('demo.copro')::uuid, 'LOT' || lpad(i::text, 3, '0')),
  (select attendee_id from public.attendee_members
   where member_id = pg_temp.member(current_setting('demo.copro')::uuid, 'LOT' || lpad((1 + (i - 71) / 3)::text, 3, '0'))),
  'named') from generate_series(71, 88) i;
select pg_temp.staff(current_setting('demo.copro')::uuid);
select public.set_assembly_status(current_setting('demo.copro')::uuid, 'convened', null);

commit;

\o
\pset tuples_only on
select 'Démo prête : ' || string_agg(a.title || ' (' || (select count(*) from public.members m where m.assembly_id = a.id) || ' membres)', ' · ')
from public.assemblies a where a.org_id = 'd0000000-0000-4000-8000-0000000000aa';
