-- 0001 — Extensions, schéma privé, privilèges par défaut, types énumérés.
--
-- Principe (docs/PLAN_LOT1.md §2.5) : les clients n'écrivent jamais directement dans
-- les tables. Toute écriture passe par une RPC SECURITY DEFINER. On retire donc les
-- privilèges que Supabase accorde par défaut à anon/authenticated/service_role, et
-- chaque migration accorde ensuite explicitement le strict nécessaire.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Schéma interne : helpers de droits, audit, logique partagée. Non exposé par l'API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Tables, séquences et fonctions créées par la suite : aucun privilège implicite.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public;

-- ===== Types énumérés (ensemble du Lot 1 et suivants, cf. plan §2.2) =====
create type public.assembly_type as enum ('ago', 'age', 'mixed', 'other');
create type public.assembly_mode as enum ('in_person', 'remote', 'hybrid');
create type public.assembly_status as enum ('draft', 'convened', 'in_session', 'closed', 'archived');
create type public.org_role as enum ('org_admin', 'organizer');
create type public.staff_role as enum ('president', 'secretary', 'scrutineer', 'reception');
create type public.member_kind as enum ('person', 'legal_entity');
create type public.attendee_status as enum ('expected', 'present', 'left');
create type public.presence_status as enum ('expected', 'present', 'represented', 'correspondence', 'left', 'absent');
create type public.proxy_type as enum ('named', 'blank', 'temporary');
create type public.proxy_status as enum ('pending', 'active', 'revoked');
create type public.vote_type as enum ('yes_no_abstain', 'multiple_choice', 'election', 'information');
create type public.resolution_mode as enum ('electronic', 'show_of_hands', 'mixed');
create type public.ballot_status as enum ('open', 'closed', 'validated', 'cancelled');
create type public.cast_channel as enum ('device', 'operator', 'show_of_hands', 'correspondence');
create type public.ballot_outcome as enum ('adopted', 'rejected', 'no_quorum', 'information');

-- ===== Erreurs métier =====
-- Code stable dans `message`, contexte éventuel dans `detail` (JSON). Traduit en
-- français côté client (lib/rpc/errors.ts).
create function private.fail(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail::text, '');
end;
$$;
