-- Vérifie que l'environnement de test pgTAP est opérationnel.
begin;
select plan(1);
select has_schema('public', 'le schéma public existe');
select * from finish();
rollback;
