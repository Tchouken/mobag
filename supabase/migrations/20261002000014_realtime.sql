-- 0014 — Temps réel (plan §1, principe 6).
--
-- Diffusion par Broadcast (canaux privés), jamais par Postgres Changes : un message ne porte
-- qu'un signal d'invalidation ({kind}) ; les écrans relisent l'état par RPC, sous leurs droits.
-- Deux canaux par AG :
--   assembly:{id}:staff  — personnel (accueil, régie) : présence, personnes, pouvoirs, appareils,
--                          scrutins, résultats, ordre du jour, statut de l'AG ;
--   assembly:{id}:voters — appareils des votants de l'AG : scrutins et statut de l'AG.
-- Les votes eux-mêmes ne sont pas diffusés (la participation est relue par la régie).
-- Un même signal n'est envoyé qu'une fois par instruction cliente, c'est-à-dire par appel de
-- RPC (un émargement touche plusieurs tables). realtime.send ne fait jamais échouer la transaction appelante.

-- ===== Envoi =====
create function private.notify(p_assembly uuid, p_kind text, p_audience text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag text := 'mobag.n' || md5(concat_ws(':', p_assembly, p_kind, p_audience, statement_timestamp()));
begin
  if p_assembly is null or coalesce(current_setting(v_flag, true), '') = '1' then
    return;
  end if;
  perform set_config(v_flag, '1', true);
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    return;   -- base sans Realtime (tests isolés) : rien à diffuser
  end if;
  execute 'select realtime.send($1, $2, $3, true)'
  using jsonb_build_object('kind', p_kind, 'at', clock_timestamp()), p_kind,
        format('assembly:%s:%s', p_assembly, p_audience);
end;
$$;

-- Déclencheur générique (niveau instruction) : TG_ARGV = colonne de l'AG, signal, audiences.
create function private.broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly uuid;
  v_audience text;
begin
  for v_assembly in execute format('select distinct %I from changed', tg_argv[0]) loop
    foreach v_audience in array string_to_array(tg_argv[2], ',') loop
      perform private.notify(v_assembly, tg_argv[1], v_audience);
    end loop;
  end loop;
  return null;
end;
$$;

-- Un déclencheur par table et par opération (les tables de transition l'exigent).
do $$
declare
  v record;
  v_op text;
begin
  for v in select * from (values
      ('member_presence', 'assembly_id', 'presence', 'staff'),
      ('attendees', 'assembly_id', 'attendees', 'staff'),
      ('proxies', 'assembly_id', 'proxies', 'staff'),
      ('voter_tokens', 'assembly_id', 'devices', 'staff'),
      ('resolutions', 'assembly_id', 'resolutions', 'staff'),
      ('ballots', 'assembly_id', 'ballot', 'staff,voters'),
      ('ballot_eligibility', 'assembly_id', 'ballot', 'voters'),
      ('results', 'assembly_id', 'result', 'staff'),
      ('assemblies', 'id', 'assembly', 'staff,voters')) t(tbl, col, kind, audience)
  loop
    foreach v_op in array array['insert', 'update'] loop
      -- Base figée : seuls les changements de porteur (5.6.4) concernent les votants.
      continue when v.tbl = 'ballot_eligibility' and v_op = 'insert';
      execute format(
        'create trigger %I after %s on public.%I referencing new table as changed '
        'for each statement execute function private.broadcast_changes(%L, %L, %L)',
        v.tbl || '_broadcast_' || v_op, v_op, v.tbl, v.col, v.kind, v.audience);
    end loop;
  end loop;
end;
$$;

-- ===== Autorisation des canaux privés =====
-- Le serveur Realtime évalue ces politiques à l'abonnement, sous l'identité de l'utilisateur
-- (realtime.topic() = canal demandé). Aucune politique d'envoi : seule la base diffuse.
create function private.can_receive_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(p_topic, ':', 1) = 'assembly'
     and case split_part(p_topic, ':', 3)
           when 'staff' then private.can_read_assembly(private.try_uuid(split_part(p_topic, ':', 2)))
           when 'voters' then private.current_attendee_id(private.try_uuid(split_part(p_topic, ':', 2))) is not null
           else false
         end;
$$;
grant execute on function private.can_receive_topic(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy mobag_receive_assembly_signals on realtime.messages for select to authenticated
        using (realtime.messages.extension = 'broadcast' and private.can_receive_topic(realtime.topic()))
    $p$;
  end if;
end;
$$;
