-- 0019 — État de la plateforme (T18) : gel des déploiements le jour d'une AG (SPEC §7.2).
-- Lecture publique d'agrégats seulement (aucun nom, aucun identifiant) : nombre d'AG en séance
-- et d'AG convoquées dont la séance commence dans les 12 heures (ou a commencé depuis moins de
-- 12 heures). Utilisée par /api/health, la garde de déploiement Vercel et le contrôle GitHub.
create function public.platform_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'in_session', (select count(*) from public.assemblies where status = 'in_session'),
    'starting_soon', (select count(*) from public.assemblies
                      where status = 'convened'
                        and starts_at between statement_timestamp() - interval '12 hours'
                                          and statement_timestamp() + interval '12 hours'),
    'at', statement_timestamp());
$$;
grant execute on function public.platform_status() to anon, authenticated;
