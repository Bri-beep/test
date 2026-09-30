# Contrôles de validation analytics

Choisir uniquement les contrôles qui peuvent changer la confiance accordée au KPI ou à la décision.

## Contrat et qualité des sources

- **Grain** : une ligne représente-t-elle la même unité dans toutes les périodes et sources ?
- **Complétude** : comparer les taux de valeurs nulles et de couverture, pas uniquement les volumes bruts.
- **Unicité** : vérifier les clés candidates et quantifier les doublons avant de les dédupliquer.
- **Validité** : contrôler domaines, bornes, signes, unités et combinaisons impossibles.
- **Cohérence** : rapprocher les totaux avec une source de référence indépendante lorsqu'elle existe.
- **Intégrité** : vérifier les lignes orphelines et la cardinalité réelle des jointures.
- **Fraîcheur** : comparer la dernière donnée disponible au SLA et distinguer période complète et période en cours.
- **Stabilité** : rechercher une rupture de volume, schéma, distribution ou logique de collecte.

Segmenter les anomalies par période, source ou dimension pertinente. Un taux est souvent plus informatif qu'un nombre
absolu. Ne pas corriger silencieusement une anomalie : mesurer son effet avec et sans correction.

## Calculs et comparaisons

- Recalculer séparément numérateur, dénominateur et éventuelle base de référence.
- Vérifier les exclusions, le traitement des valeurs nulles, des retours, annulations et doublons.
- Aligner périodes, fuseaux horaires, calendriers métier et profondeur d'historique.
- Utiliser une moyenne pondérée lorsque les groupes n'ont pas le même poids ; éviter la moyenne de pourcentages sans
  dénominateurs.
- Contrôler unités, facteurs de conversion, signe, arrondi et format d'affichage.
- Tester les cas zéro, vide, valeur inconnue, très grand volume et frontière de période.
- Comparer les sous-totaux au total et expliquer les populations non additives.

## Risques statistiques

Pour une simple description exhaustive d'une population, ne pas ajouter artificiellement un test d'hypothèse. Pour une
inférence, une expérimentation, une anomalie ou un modèle, examiner selon le contexte :

- taille et représentativité de l'échantillon ;
- intervalle de confiance et taille d'effet, en plus d'une éventuelle valeur de test ;
- hypothèses de distribution, indépendance et variance ;
- comparaisons multiples et sélection opportuniste de segments ou périodes ;
- paradoxe de Simpson et changements de composition entre groupes ;
- saisonnalité, tendance, autocorrélation et périodes partielles ;
- valeurs extrêmes dominant une moyenne ;
- biais de sélection, survivance, attrition ou données manquantes non aléatoires ;
- fuite temporelle pour une prévision ou un modèle ;
- confusion entre association, prédiction et causalité.

Privilégier l'importance pratique pour la décision. Une différence statistiquement détectable peut être négligeable, et
une absence de significativité peut simplement refléter une puissance insuffisante.

## Visualisation et interface

- Le titre, l'unité, la période et la population décrivent-ils exactement le calcul ?
- Les axes, échelles, couleurs et arrondis peuvent-ils exagérer ou masquer l'écart ?
- Le comparatif utilise-t-il une base cohérente et visible ?
- Le graphique expose-t-il l'incertitude ou la faible taille d'échantillon lorsque nécessaire ?
- Les filtres modifient-ils à la fois le chiffre, son libellé et son contexte ?
- Les états vide, incomplet et erreur sont-ils distincts d'une valeur métier égale à zéro ?
- Le tableau ou graphique reste-t-il compréhensible au clavier et sans dépendre uniquement de la couleur ?

## Format d'un finding

```markdown
### <KPI ou vue> — <niveau d'impact>

- Statut : Fait | Hypothèse | Non vérifié
- Preuve : <fichier, contrat ou contrôle borné>
- Écart : <définition attendue contre comportement observé>
- Impact décisionnel : <ce qui peut être mal interprété>
- Correction minimale : <action ciblée>
- Propriétaire attendu : <métier, data ou application>
```
