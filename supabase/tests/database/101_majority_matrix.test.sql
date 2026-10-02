-- Matrice des règles de majorité évaluées sur des décomptes (private.evaluate_rule) :
-- égalités, abstentions, base vide, unanimité, double majorité (têtes et voix).
begin;
select plan(12);

create function pg_temp.tallies(p_for numeric, p_against numeric, p_abstain numeric, p_included boolean,
                                p_pr numeric, p_all numeric, p_for_heads int default 1, p_all_heads int default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'for', jsonb_build_object('weight', p_for, 'heads', p_for_heads),
    'expressed', jsonb_build_object('weight', p_for + p_against + case when p_included then p_abstain else 0 end,
                                    'heads', 1),
    'present_represented', jsonb_build_object('weight', p_pr, 'heads', 1),
    'all_members', jsonb_build_object('weight', p_all, 'heads', p_all_heads)) $$;
create function pg_temp.rule(p_base text, p_num int, p_den int, p_cmp text, p_measure text default 'weight')
returns jsonb language sql as $$
  select jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('measure', p_measure, 'numerator', 'for',
    'base', p_base, 'num', p_num, 'den', p_den, 'comparison', p_cmp))) $$;
create function pg_temp.adopted(p_rule jsonb, p_tallies jsonb) returns boolean language sql as $$
  select (private.evaluate_rule(p_rule, p_tallies) ->> 'reached')::boolean $$;

-- Majorité simple des exprimés (> 1/2)
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 2, 'gt'), pg_temp.tallies(50, 50, 0, false, 100, 100)), false,
  'égalité parfaite : rejetée');
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 2, 'gt'), pg_temp.tallies(50.000001, 50, 0, false, 100, 100)), true,
  'un millionième de plus : adoptée (calcul exact)');
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 2, 'gte'), pg_temp.tallies(50, 50, 0, false, 100, 100)), true,
  'au moins la moitié : l''égalité suffit');
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 2, 'gt'), pg_temp.tallies(40, 30, 30, false, 100, 100)), true,
  'abstentions exclues : 40 contre 30, adoptée');
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 2, 'gt'), pg_temp.tallies(40, 30, 30, true, 100, 100)), false,
  'abstentions comptées : 40 sur 100, rejetée');
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 2, 'gt'), pg_temp.tallies(0, 0, 10, false, 10, 10)), false,
  'aucun suffrage exprimé : rejetée');
-- Majorités qualifiées et absolues
select is(pg_temp.adopted(pg_temp.rule('expressed', 2, 3, 'gte'), pg_temp.tallies(2, 1, 0, false, 3, 3)), true,
  'deux tiers exactement : adoptée');
select is(pg_temp.adopted(pg_temp.rule('present_represented', 1, 2, 'gt'), pg_temp.tallies(45, 10, 0, false, 100, 200)), false,
  'majorité des présents et représentés : 45 sur 100, rejetée');
select is(pg_temp.adopted(pg_temp.rule('all_members', 1, 2, 'gt'), pg_temp.tallies(101, 0, 0, false, 150, 200)), true,
  'majorité absolue de tous les membres : 101 sur 200');
select is(pg_temp.adopted(pg_temp.rule('expressed', 1, 1, 'gte'), pg_temp.tallies(99, 1, 0, false, 100, 100)), false,
  'unanimité : une voix contre suffit à rejeter');
-- Double majorité (têtes et voix)
select is(pg_temp.adopted(
  pg_temp.rule('all_members', 1, 2, 'gt', 'heads') || jsonb_build_object('conditions',
    (pg_temp.rule('all_members', 1, 2, 'gt', 'heads') -> 'conditions') || (pg_temp.rule('all_members', 2, 3, 'gte') -> 'conditions')),
  pg_temp.tallies(700, 0, 0, false, 1000, 1000, 6, 10)), true, 'double majorité atteinte (6 têtes sur 10, 70 % des voix)');
select is(pg_temp.adopted(
  jsonb_build_object('conditions',
    (pg_temp.rule('all_members', 1, 2, 'gt', 'heads') -> 'conditions') || (pg_temp.rule('all_members', 2, 3, 'gte') -> 'conditions')),
  pg_temp.tallies(900, 0, 0, false, 1000, 1000, 5, 10)), false, 'double majorité : 5 têtes sur 10 ne suffisent pas');

select * from finish();
rollback;
