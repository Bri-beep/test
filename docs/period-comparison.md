# Comparaison de périodes et contributions

Cette option convient aux KPI dont la variation dans le temps aide à décider. Elle reste inutile pour certaines apps.
La démonstration `/visualizations#period-comparison` fonctionne sans credentials et affiche uniquement des commandes synthétiques.

## Générer une feature facultative

Après avoir déclaré une source avec `app data`, ajouter sa colonne de date :

```bash
npm run app -- feature evolution-commandes --source commandes \
  --aggregation sum --column amount --label "Montant des commandes" --unit EUR \
  --date-column order_date --breakdown-column channel --non-interactive
```

`order_date` doit être une colonne **DATE**, dans le calendrier métier convenu. Une colonne TIMESTAMP nécessite une
conversion explicite du fuseau dans une vue déclarée ou une adaptation du repository. Le générateur ne fait pas cette conversion.
`--date-column` ajoute le sélecteur, les calculs, l'API et les tests. `--breakdown-column` ajoute des segments disjoints,
un filtre commun et, pour `count` ou `sum`, le waterfall. Pour `avg`, le filtre reste disponible sans waterfall.
Sans ces options, la génération du KPI simple reste identique. Aucun plugin, droit, stockage ou ressource n'est ajouté.
Les choix figurent dans `features[].comparison` et dans le brief produit.
La démo de comparaison utilise une série fixe ; `--demo-value` concerne uniquement le KPI simple.

## Contrat de comparaison

- Les dates affichées sont incluses. Chaque fenêtre couvre entre 1 et 366 jours.
- La période précédente est contiguë et de même durée. L'année précédente reprend les dates calendaires.
- Un 29 février devient le 28 février de référence. Un message signale cet ajustement et toute différence de durée.
- La référence personnalisée peut chevaucher la période analysée ; ce chevauchement est signalé.
- Aucun total n'est normalisé implicitement par jour. La série aligne J1 avec J1 et son tableau donne les dates exactes.
- L'écart absolu vaut `analysée − référence`. Le pourcentage vaut `100 × écart / référence` pour une référence positive.
- Une référence nulle ou négative conserve l'écart absolu mais n'affiche aucun pourcentage trompeur.
- Une période sans mesure exploitable reste indisponible. Elle ne devient pas zéro.
- Les moyennes utilisent `somme des valeurs / nombre de valeurs non nulles`, jamais une moyenne des moyennes quotidiennes.
- Les mesures nulles sont exclues, comptées et signalées ; elles désactivent la décomposition automatique.

La complétude réelle reste **non vérifiée** par défaut. `buildComparison` accepte un intervalle `completeCoverage`
uniquement lorsque le contrat source le garantit. Une fenêtre hors de cet intervalle est marquée partielle.
Ni la dernière observation ni une fréquence de rafraîchissement déclarée ne prouvent cette couverture.
La démo annonce explicitement sa couverture du 1er janvier 2024 au 20 septembre 2026.

Le repository génère une requête nommée avec deux fenêtres liées par paramètres et des bornes de fin exclusives.
La source déclarée passe par `IDENTIFIER(:source)`. Les colonnes viennent de la spec validée, jamais du navigateur.
Les lignes agrégées par jour et segment passent par Zod. Le timeout de `SqlExecutor` reste applicable.
Avec une dimension, le repository choisit le transport driver déjà conservé par le template, afin de préserver
les libellés STRING ressemblant à du JSON, notamment `null`. Sans dimension, il utilise l'adaptateur Analytics AppKit.
Ce choix suit [l'exception de compatibilité existante](appkit-maintenance.md), sans reprise automatique d'une lecture échouée.
La limite est de 1 000 agrégats et 50 segments ; une ligne sentinelle détecte un dépassement, qui refuse le résultat entier.
Les doublons de grain et les lignes hors fenêtre sont refusés. Aucune réponse partielle n'est affichée comme un total.

Le filtre de segment s'applique aux agrégats bornés des **deux** périodes. Il ne réduit pas le volume lu par le warehouse.
Pour un autre filtre métier, l'ajouter au contrat de requête puis aux deux branches SQL avec les mêmes paramètres validés.
Les endpoints n'acceptent ni SQL libre ni source fournie par le client. Les erreurs suivent `withApiRoute`, avec request ID.
Le cache est désactivé. Aucun résultat ni sélection de comparaison n'est persisté automatiquement.

## Waterfall

`WaterfallChart`, exporté par `@/components/data-visualization`, reçoit `start`, `end` et des `contributions` identifiées.
La feature calcule la contribution d'un segment comme son total analysé moins son total de référence.
Une catégorie absente vaut zéro uniquement à l'intérieur d'une période observée, pour une mesure additive.
La source doit fournir des segments disjoints au même grain et la même population, sans double comptage.
Un taux, un stock non additif dans le temps ou une moyenne demande une méthode métier spécifique.
Le composant décrit les contributions comptables ; il ne démontre aucune causalité.

Le graphique conserve une origine à zéro et accepte les valeurs négatives. Il affiche un éventuel **écart non attribué**.
Au-delà de dix contributions, il conserve les neuf premières puis un groupe « Autres » ; le tableau garde toutes les valeurs.
Les couleurs indiquent la direction, sans juger si une hausse est souhaitable. Le tableau et le défilement sont accessibles au clavier.
Les variations faibles peuvent produire de petites barres : les valeurs exactes restent visibles, sans tronquer l'axe.

Une app existante peut composer `PeriodComparison` avec son endpoint de feature et `initialSelection`.
Sans sélection initiale, les dates couvrent les quatorze jours terminés avant la date courante UTC.
Fournir `initialSelection` pour appliquer une autre convention de calendrier métier.
`showWaterfall` vaut `false` par défaut ; l'activer seulement pour une décomposition revue.
Le changement de sélection annule le suivi de la requête précédente. L'exécution SQL déjà envoyée peut continuer jusqu'à sa limite.

## Vérifier avant utilisation réelle

Relire DATE/fuseau, grain, population, doublons, unité, additivité, fenêtres, valeurs nulles et couverture avec
le skill `validate-analytics-kpis`. Les fixtures prouvent les calculs locaux et les bindings ; elles ne prouvent pas
l'exécution du SQL sur votre source. Effectuer ensuite une lecture bornée sur la cible convenue et comparer à un calcul indépendant.
Les changements de déploiement suivent [le runbook existant](deployment.md).

## Explorer la comparaison avec Genie

La prop facultative `genie={{ alias: "sales" }}` ajoute une entrée vers un Space configuré.
Elle utilise la comparaison affichée, avec ses deux périodes, ses filtres, ses valeurs et ses réserves.
Une sélection non appliquée désactive le bouton. La question est préremplie, modifiable et envoyée explicitement.
Le Space doit couvrir les mêmes sources et définitions. Les observations du navigateur restent à vérifier.
Les cartes épinglées restent en mémoire ; elles ne rejoignent pas les tables d’état personnel.
Voir [le contrat et la recette Genie](genie.md). La démo `/visualizations` active ce lien uniquement en mode démo.

## Partager une comparaison

Cette option ajoute « Partager cette analyse » à une comparaison. Elle reste désactivée par défaut.
La démo `/visualizations` l'active sur ses données synthétiques.
Le panneau propose deux actions : copier le lien, ou copier une synthèse avec ce lien.
Si le navigateur refuse le presse-papiers, un champ sélectionnable permet la copie manuelle.
L'app n'envoie aucun message et ne crée aucun stockage de résultats.

Pour une nouvelle feature, ajouter `--share-analysis` avec `--date-column` :

```bash
npm run app -- feature evolution-commandes --source commandes \
  --aggregation sum --column amount --label "Montant des commandes" --unit EUR \
  --date-column order_date --share-analysis --non-interactive
```

`--share-segment` exige aussi `--share-analysis` et `--breakdown-column`.
Cette option déclare que la dimension peut être partagée. Examiner ses valeurs avant de l'activer.
Les identifiants personnels et les segments sensibles n'ont pas leur place dans un lien.
Le partage d'une sélection filtrée reste désactivé tant que cette autorisation manque.
L'app ne retire pas silencieusement le filtre pour fabriquer un autre résultat.

Pour une comparaison existante, fournir une clé stable, propre à la vue :

```tsx
<PeriodComparison
  endpoint="/api/evolution-commandes"
  sharing={{ key: "evolution-commandes", allowSegment: false }}
/>
```

`allowSegment` vaut `false` par défaut. Passer `true` seulement après revue de la dimension.
La clé accepte 1 à 64 caractères : lettres minuscules, chiffres et tirets, avec une lettre ou un chiffre au début.
Conserver la clé tant que la vue garde la même définition métier.
Les filtres supplémentaires d'une app demandent un contrat de partage explicite avant activation.
Les paramètres URL préexistants ne sont pas repris par cette option.

Le lien conserve la route courante et remplace sa query et son fragment.
Son fragment `#comparison=` contient uniquement une définition JSON encodée, stricte et versionnée.
Cette définition comprend la clé, le mode, les dates résolues des deux périodes et le segment autorisé éventuel.
Les dates restent fixes, même pour « période précédente » ou « année précédente ».
Un lien invalide, incompatible avec la vue ou incohérent affiche une explication, sans charger silencieusement une comparaison par défaut.
Le lecteur peut reprendre le formulaire pour choisir une nouvelle comparaison.

L'ouverture recalcule les données avec les accès habituels de l'app. Le lien ne donne aucun droit supplémentaire.
Les chiffres peuvent donc changer entre deux consultations. Aucun résultat, SQL, identifiant d'analyse personnelle ou contenu Genie n'entre dans le lien.

La synthèse décrit le résultat réellement affiché : KPI, unité, source ou démo, périodes, filtre, valeurs, écarts et réserves.
Elle ajoute la date de consultation et le lien de reprise. Cette date ne prouve pas la fraîcheur des données.
La synthèse copie les chiffres consultés ; le lien permet un nouveau calcul.
Une sélection modifiée mais non appliquée désactive le partage jusqu'à son actualisation.
Le partage reste aussi désactivé lorsque les deux périodes n'ont aucune valeur disponible.

Avant livraison, vérifier la reprise du lien, les dates fixes, les réserves et la copie manuelle.
Vérifier aussi les liens invalides et le refus d'un segment non autorisé.
Les tests locaux utilisent des données synthétiques ; ils ne prouvent ni les droits réels ni la qualité de la source.
