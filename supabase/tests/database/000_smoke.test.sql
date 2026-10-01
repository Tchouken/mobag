-- Vérifie que l'environnement de test pgTAP est opérationnel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
select has_schema('public', 'le schéma public existe');
select * from finish();
rollback;
