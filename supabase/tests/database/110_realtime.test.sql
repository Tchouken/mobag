-- Temps réel : signaux d'invalidation diffusés par la base (un par transaction et par sujet),
-- canaux privés réservés au personnel de l'AG ou à ses appareils votants.
begin;
select to_regclass('realtime.messages') is not null as has_realtime \gset
\if :has_realtime
select plan(12);

-- Partition du jour (créée d'habitude par le serveur Realtime).
do $$
declare
  v_name text := 'messages_' || to_char(current_date, 'YYYY_MM_DD');
begin
  if to_regclass('realtime.' || v_name) is null then
    execute format('create table realtime.%I partition of realtime.messages for values from (%L) to (%L)',
                   v_name, current_date, current_date + 1);
  end if;
end;
$$;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a2', 'a2@org-a.test', false),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@org-b.test', false),
  ('00000000-0000-0000-0000-0000000000f1', null, true),
  ('00000000-0000-0000-0000-0000000000f2', null, true);
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
create function pg_temp.signals(p_audience text) returns text language sql as $$
  select string_agg(event, ',' order by event) from realtime.messages
  where topic = 'assembly:' || pg_temp.ag() || ':' || p_audience $$;
-- Ce qu'un abonné recevrait sur un canal (politique de lecture évaluée pour ce canal).
create function pg_temp.visible(p_audience text) returns int language plpgsql as $$
declare
  v int;
begin
  perform set_config('realtime.topic', 'assembly:' || pg_temp.ag() || ':' || p_audience, true);
  select count(*) into v from realtime.messages where topic = current_setting('realtime.topic');
  return v;
end;
$$;
grant execute on function pg_temp.ag(), pg_temp.visible(text) to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select set_config('test.ag', public.create_assembly('aaaaaaaa-0000-0000-0000-000000000000', 'AG', 'ago', 'association',
  '', '2026-06-15 18:00')::text, true);
select public.import_members(pg_temp.ag(), '[{"external_ref": "A", "last_name": "Alpha", "weights": {"voix": 3}}]', 'append', false);
select public.upsert_attendee(pg_temp.ag(), null, 'Alice', null, null,
  array[(select id from public.members where assembly_id = pg_temp.ag())], false);
select public.set_assembly_status(pg_temp.ag(), 'convened', null);
reset role;
delete from realtime.messages where topic like 'assembly:' || pg_temp.ag() || ':%';

-- ----- Émargement : un signal par sujet, une seule fois -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.check_in(pg_temp.ag(), (select id from public.attendees where assembly_id = pg_temp.ag()));
reset role;
select is(pg_temp.signals('staff'), 'attendees,presence', 'émargement : personnes et présence, une fois chacun');
select is(pg_temp.signals('voters'), null, 'les votants ne sont pas dérangés par l''accueil');
select is((select payload ->> 'kind' from realtime.messages where topic = 'assembly:' || pg_temp.ag() || ':staff' limit 1)
          in ('attendees', 'presence'), true, 'le message ne porte qu''un signal');
select is((select bool_and(private) from realtime.messages where topic like 'assembly:' || pg_temp.ag() || ':%'), true,
  'canaux privés');

-- ----- Changement de statut : personnel et votants -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.set_assembly_status(pg_temp.ag(), 'in_session', null);
select set_config('test.code', public.issue_voter_token((select id from public.attendees where assembly_id = pg_temp.ag()),
  'personal') ->> 'code', true);
reset role;
select is(pg_temp.signals('voters'), 'assembly', 'ouverture de séance signalée aux votants');
select ok(pg_temp.signals('staff') like '%devices%', 'émission d''un code signalée au personnel');

-- ----- Droits de réception -----
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select ok(pg_temp.visible('staff') > 0, 'le personnel de l''AG reçoit son canal');
select ok(pg_temp.visible('voters') > 0, 'et celui des votants (signaux et présence des terminaux)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is(pg_temp.visible('staff'), 0, 'une autre organisation ne reçoit rien');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.claim_voter_token(current_setting('test.code'));
select is(pg_temp.visible('voters'), 1, 'l''appareil associé reçoit le canal des votants');
select is(pg_temp.visible('staff'), 0, 'mais pas celui du personnel');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select is(pg_temp.visible('voters'), 0, 'un appareil non associé ne reçoit rien');
reset role;
\else
select plan(1);
select skip('Realtime absent de cette base', 1);
\endif

select * from finish();
rollback;
