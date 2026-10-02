-- 0018 — Écran du votant : une seule lecture à l'ouverture d'un scrutin (T17).
-- Chaque requête d'un appareil coûte surtout la vérification de son jeton (signature ES256)
-- par l'API ; à l'ouverture d'un scrutin, les 2 000 écrans relisent leur état en même temps.
-- my_voter_context inclut désormais les scrutins ouverts (my_ballots) : un appel au lieu de deux.
create or replace function public.my_voter_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token public.voter_tokens := private.current_voter_token();
  v_assembly public.assemblies;
  v_attendee public.attendees;
begin
  if v_token.id is null then
    return null;
  end if;
  select * into v_assembly from public.assemblies where id = v_token.assembly_id;
  select * into v_attendee from public.attendees where id = v_token.attendee_id;
  return jsonb_build_object(
    'assembly', jsonb_build_object('id', v_assembly.id, 'title', v_assembly.title, 'status', v_assembly.status,
                                   'starts_at', v_assembly.starts_at, 'timezone', v_assembly.timezone),
    'attendee', jsonb_build_object('id', v_attendee.id, 'full_name', v_attendee.full_name, 'status', v_attendee.status),
    'device', jsonb_build_object('kind', v_token.kind, 'label', v_token.device_label),
    'portfolio', private.attendee_portfolio(v_attendee.id),
    'ballots', public.my_ballots());
end;
$$;
