# Décisions et questions ouvertes

Statuts : 🔴 bloquant, ouvert · 🟡 proposition par défaut en attente de confirmation · ✅ décidé.

## Questions du CDC §9

| # | Question | Statut | Bloque | Proposition / réponse |
|---|---|---|---|---|
| Q1 | Types d'AG prioritaires (sociétés, copropriétés, associations) | 🔴 | T3 (presets), démos | — |
| Q2 | Taille maximale visée d'une AG | 🔴 | T17, choix du plan Supabase | Supabase Pro limite par défaut les connexions Realtime simultanées (~500). 2 000 votants imposent un add-on |
| Q3 | Terminaux : smartphones personnels, tablettes prêtées, ou les deux | 🔴 | T8, T9 | Les tablettes partagées imposent un mode kiosque et une réaffectation entre personnes |
| Q4 | Valeur juridique de la signature à l'écran | 🟡 | T9 | Signature manuscrite à l'écran (image + horodatage + hash dans l'audit), sans prestataire qualifié |
| Q5 | Modèle de vote secret (§7.3) | 🟡 | T10 | Modèle §7.3 : vote lié au membre en base, jamais exposé, résultats agrégés |
| Q6 | Qui opère le jour J (régie MobilActif ou client autonome) | 🔴 | T12 | — |
| Q7 | Validation des presets par un juriste | 🟡 | mise en production | `rule_presets.validated_by_lawyer` |

## Ambiguïtés relevées dans le CDC

| # | Sujet | Statut | Proposition |
|---|---|---|---|
| B1 | §5.4 interdit la sous-délégation, mais §5.6 (a) permet au partant de transmettre « ses voix et ses pouvoirs » | 🟡 | Réglage `allow_transfer_on_departure` : la transmission est autorisée uniquement lors d'un départ, et tracée |
| B2 | Départ sans pouvoir pendant un scrutin ouvert | 🟡 | La base figée reste inchangée : le membre compte comme présent non votant |
| B3 | Combinaison des plafonds de pouvoirs | 🟡 | `combine: and/or` entre nombre et pourcentage (copro : ≤ 3 pouvoirs OU ≤ 10 %). Pourcentage calculé sur la clé principale |
| B4 | Calcul du quorum, issue si non atteint | 🟡 | Quorum en voix, en têtes ou les deux, par clé. Issue `no_quorum` distincte de « rejeté » |
| B5 | Mode dégradé (§7.2) au Lot 1, alors que la main levée est prévue au Lot 2 | 🟡 | Pas de saisie de secours au Lot 1. Procédure papier documentée dans le RUNBOOK |
| B6 | Comptes Supabase (UE, Pro) et Vercel | 🔴 | Comptes existants ou à créer ? Nécessaires pour la CI DB distante et les previews |
