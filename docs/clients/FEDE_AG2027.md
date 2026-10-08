# Client FEDE — AG du 14 avril 2027 (Paris)

Fiche client. Les besoins propres à la FEDE sont décrits ici et seront réalisés **par
paramétrage** (règles, clés de répartition, imports) et par le module générique « élections » :
aucun code spécifique à ce client dans l'application.

Contact : Trang BUI. Suivi commercial : Thibaut (MobilActif).

## Besoin exprimé

- AG à Paris, vote le **14 avril 2027** ; environ 200 votants ; pas de quorum ; pas de prévote.
- Vote sur le téléphone des participants, accès sécurisé.
- 4 scrutins en 2027 : Conseil exécutif, Comité, représentant du Maroc, représentant des écoles
  africaines (hors Maroc).
- Droits de vote différents selon les pays ; la FEDE attribue à chaque participant ses scrutins
  et son nombre de voix ; chaque électeur ne voit que les bulletins auxquels il est habilité.
- Procurations : 3 au maximum par mandataire.
- Dépouillement électronique et export des résultats.
- Bulletins 2023 reçus : pour chaque candidat Pour / Contre / Abstention, candidats regroupés
  en sections avec un nombre de postes (« 6 postes uniquement »).

## Correspondance avec MobAG

| Besoin                          | Réponse                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| Pas de quorum                   | Règle de quorum vide (existant)                                       |
| Droits par participant et pays  | Une clé de répartition par scrutin ; 0 voix = non habilité (existant) |
| Procurations, 3 maximum         | `proxy_rules.max_count = 3` (existant)                                |
| Accès par téléphone             | Code ou QR personnel (existant)                                       |
| Bulletin d'élection par section | **À développer** : module élections générique (Lot 2)                 |
| Masquer les bulletins non dus   | **À développer** : écran du votant filtré par habilitation            |
| Résultats par candidat, export  | **À développer** : classement par section, exports                    |
| Français et anglais             | **À développer** : interface du votant bilingue                       |

## Réponses obtenues (échange du 8 octobre 2026, à confirmer par écrit)

| #   | Sujet                         | Réponse                                                                                                          |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Qui est élu                   | Les N candidats ayant obtenu le plus de « Pour »                                                                 |
| 2   | Égalité pour le dernier siège | **Ouvert**                                                                                                       |
| 3   | « 6 postes uniquement »       | 6 sièges à pourvoir dans la section                                                                              |
| 4   | Trop de « Pour » cochés       | Bulletin non annulé, l'élection se fait à la majorité ; **à préciser** : limiter ou non à N « Pour » à la saisie |
| 5   | Abstentions et non-réponses   | **Ouvert**                                                                                                       |
| 6   | Électorat par scrutin         | Seuls les Marocains votent pour le représentant du Maroc ; structure du Comité **à préciser**                    |
| 13  | Date du vote                  | 14 avril 2027                                                                                                    |
| 14  | Remise des accès              | QR code, **à confirmer**                                                                                         |
| 15  | Langues                       | Français et anglais                                                                                              |
| 17  | Résultats sur grand écran     | Oui a priori, **à confirmer**                                                                                    |

Questions 7 à 12, 16, 18 et 19 : en attente (voir le courriel ci-dessous).

## Courriel préparé pour la FEDE

> Objet : AG FEDE 2027 – vote électronique : points à valider
>
> Bonjour Trang,
>
> Merci pour votre message et pour les bulletins 2023. Notre solution répond à votre besoin : vote
> depuis le téléphone des participants avec un accès personnel sécurisé, habilitation de chaque
> participant aux seuls scrutins qui le concernent (avec son nombre de voix), procurations
> limitées à trois par mandataire, dépouillement électronique et export des résultats. Le format
> de vos bulletins (candidats par section, Pour / Contre / Abstention, nombre de postes) sera
> intégré pour votre AG.
>
> Afin de paramétrer les scrutins au plus près de vos statuts, pourriez-vous nous confirmer les
> points suivants ?
>
> **Ce que nous avons compris (merci de confirmer)**
>
> 1. Sont élus, dans chaque section, les candidats ayant obtenu le plus de voix « Pour », dans la
>    limite du nombre de postes (par exemple 6).
> 2. Le vote aura lieu le 14 avril 2027.
> 3. Seuls les participants marocains votent pour le représentant du Maroc.
> 4. L'interface de vote sera proposée en français et en anglais.
> 5. Les accès seront remis sous forme de QR code personnel (à l'accueil ou par e-mail : quelle
>    option préférez-vous ?).
> 6. Les résultats seront projetés sur grand écran dans la salle après chaque scrutin.
>
> **Règles de l'élection**
>
> 7. En cas d'égalité pour le dernier poste d'une section, quelle règle s'applique (second tour,
>    candidat le plus âgé, décision du bureau, autre) ?
> 8. Un électeur peut-il cocher « Pour » pour plus de candidats qu'il n'y a de postes ? Si non,
>    préférez-vous que l'application l'en empêche au moment du vote ?
> 9. Un candidat doit-il obtenir un minimum de voix pour être élu (par exemple plus de « Pour » que
>    de « Contre ») ?
> 10. Comment sont traitées les abstentions et les candidats laissés sans réponse dans le décompte ?
> 11. Pour le Comité : combien de sections et de postes en 2027, et quels pays votent pour quelle
>     section ? Même question pour le représentant des écoles africaines (hors Maroc).
>
> **Droits de vote et procurations**
>
> 12. Les droits sont-ils fixés par pays (tous les délégués d'un même pays ont les mêmes droits) ou
>     au cas par cas pour chaque participant ?
> 13. Un participant peut-il disposer de plusieurs voix sur un même scrutin ?
> 14. Un mandataire vote-t-il de la même façon pour ses procurations et pour lui-même, ou
>     séparément pour chaque mandant ?
> 15. La limite de trois procurations s'entend-elle hors la voix propre du mandataire ?
> 16. Sous quel format et à quelle date pourrez-vous nous transmettre la liste des participants,
>     de leurs droits et des procurations ? Jusqu'à quand pourra-t-elle être modifiée ?
>
> **Déroulé et résultats**
>
> 17. Les scrutins seront-ils ouverts l'un après l'autre en séance, ou simultanément sur un
>     créneau donné ? Quelle durée prévoir ?
> 18. Le vote est-il secret ? Notre solution ne permet à personne, FEDE comprise, de consulter les
>     votes individuels : seuls les totaux sont produits.
> 19. Quels documents souhaitez-vous à l'issue du vote (résultats détaillés par section, taux de
>     participation, procès-verbal, formats PDF et Excel) ?
> 20. Certains participants pourraient-ils ne pas disposer de smartphone ? Nous pouvons prévoir
>     des tablettes de prêt.
>
> Je reste à votre disposition pour en parler de vive voix.
>
> Bien à vous,
>
> Thibaut
