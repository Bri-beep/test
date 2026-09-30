# Patterns d'historisation observés

Cette référence synthétise trois implémentations Valiuz. Elle décrit des décisions. Elle ne fournit pas du code à
copier sans adaptation.

## Traçabilité de l'audit

Les constats ont été établis le 30 août 2026 sur ces points Git. Les repositories peuvent évoluer ; vérifier à nouveau
les chemins et le diff avant de reprendre une décision :

- `valiuz/analytics_fraim_segmentation` à `72c0f6b74c5d61cd4e03d3ca01843f93909f74e9` :
  `sql/monthly_refresh_marts.sql`, `sql/setup_marts.sql`, `databricks.yml` et `docs/OPERATIONS.md`.
- `valiuz/dtm-media-pm` à `25a2f6af44fadb61a021e088dac436be7354cd0c`, sous `dlt_foresight_app/` :
  `input/foresight_runtime_config.py`, `input/raw_tickets_auc.sql`, `output/aggregated_tickets_ean_web_hot.sql`,
  `output/aggregated_tickets_ean_web.sql` et `validation/foresight_validation.sql`.
- Le même commit, Historico : `dlt_historico-core/output/agg_campaign_perf_daily.sql`,
  `notebooks/historico/promote_cold_history.py`, `backfill_cold_history.py`,
  `repair_placement_format_history.py`, `replace_cold_history_from_dev.py` et
  `hot_cold_validation_orchestrator.py`.

Cette traçabilité couvre le code. L'état d'un Job ou d'une pipeline déployée reste une preuve distante séparée.

## FRAIM segmentation : remplacement par période

FRAIM construit un rolling 12 mois et trois semestres. Les tables Delta utilisent `period_key` ou `year_month` comme
partition. Le refresh remplace le rolling et les périodes manquantes. Un paramètre fixe le dernier mois complet.

Le Job ajoute deux garde-fous utiles :

- `max_concurrent_runs: 1`.
- Un timeout de huit heures.

La table `mart_refresh_runs` conserve les volumes et la durée. Ce journal ne contient que les succès. Il ne remplace
donc pas un journal de runs avec les états `STARTED`, `SUCCEEDED` et `FAILED`.

Ne pas reprendre ces choix :

- Des `DELETE` et `INSERT` séparés sans publication atomique.
- Une reprise par numéro de statement.
- Des `OPTIMIZE` et `ANALYZE` globaux à chaque refresh.
- Un recalcul complet des dimensions qui ne changent pas.

Ce pattern convient à quelques périodes métier stables. Il ne constitue pas une archive durable.

## Foresight : fenêtre chaude et table froide

Foresight limite le calcul quotidien à une fenêtre chaude. La valeur par défaut du code est 30 jours. La source lit
un jour supplémentaire pour promouvoir une journée finalisée dans la table froide.

La sortie combine `hot` et `cold`. Un `LEFT ANTI JOIN` donne la priorité au calcul chaud. Une reprise froide accepte
une plage de dates. Le développement peut utiliser une fenêtre de sept jours.

Ce pattern réduit les lectures quotidiennes sans exiger CDF ou row tracking. Le code active l'incrémentalité seulement
sur les sources où un plan Databricks l'a validée.

Ne pas reprendre ces choix :

- Un `DELETE` puis un `INSERT` dans deux transactions.
- Une suppression de partition lorsque la source est vide.
- Un rebuild de 24 mois sans découpage ni checkpoint.
- Des paramètres de catalogues ou de dates interpolés sans validation stricte.
- Un `OPTIMIZE` global après chaque reprise.

Utiliser un staging ou `REPLACE WHERE` pour publier une plage atomique. Ajouter un timeout, un journal durable et une
validation automatique.

## Historico core : historique protégé

Historico sépare les tables chaudes gérées par Lakeflow et les tables froides externes. La publication donne la
priorité aux données chaudes. Les tables froides conservent les agrégats après l'expiration des sources récentes.

Les backfills calculent une frontière protégée. Les écritures historiques restent avant cette frontière. Les flux
append-only refusent le chevauchement et ne recréent pas les tables froides. Les workflows ciblés limitent aussi les
tables sources et les sorties concernées.

Les validations portent sur le grain, le schéma, les bornes, les doublons, les volumes et les sommes métier. Certains
indicateurs uniques utilisent des sketches HLL. Cette méthode conserve l'agrégeabilité sans stocker les identifiants
utilisateur bruts dans la couche historique.

Les scripts de réparation donnent le pattern le plus sûr du projet :

- Afficher le plan sans écriture.
- Épingler une version Delta de la source.
- Construire un staging.
- Valider les bornes, le grain, les types et les métriques.
- Créer un backup lorsque le risque le justifie.
- Publier avec `replaceWhere` ou `INSERT OVERWRITE`.
- Comparer la source et la cible avec `EXCEPT ALL`.
- Écrire le statut dans le journal d'audit.

Ce pattern est un data product. Il ne doit pas entrer dans une petite app sous forme de nombreux notebooks copiés.

La publication quotidienne actuelle réécrit toute l'histoire publique. Les validations profondes augmentent aussi la
durée. Le standard doit utiliser un contrôle quotidien léger et une réconciliation exhaustive moins fréquente.

## Critères de décision

Utiliser `bounded-replace` si toutes ces conditions sont vraies :

- Une seule app possède la sortie.
- Une colonne `DATE` limite chaque lecture.
- Le pruning physique de cette colonne est vérifié.
- La rétention source couvre la rétention de sortie et le délai de finalisation.
- La profondeur minimale et la rétention maximale de la sortie sont distinctes.
- Une plage de 366 jours ou moins suffit pour un run.
- Le calcul produit une tranche complète et déterministe.
- `REPLACE WHERE` peut publier cette tranche atomiquement.

Le starter du template matérialise la tranche dans une table temporaire de session. Il refuse les clés nulles et les
doublons avant la publication. Il insère les colonnes par nom. Le chargement initial reste une suite manuelle de lots
contigus. Il n'est pas un orchestrateur de backfill durable.

Utiliser hot/cold si une de ces conditions est vraie :

- La source expire avant la profondeur d'historique requise.
- Le calcul quotidien complet coûte trop cher.
- Plusieurs apps consomment la même histoire.
- Les corrections récentes et anciennes suivent des cadences différentes.
- Une reprise exige un journal, des checkpoints ou plusieurs étapes de validation.

## Contrat hot/cold minimal

Le contrat contient :

- Le grain final et sa comparaison null-safe.
- La colonne et les partitions de date.
- La fenêtre chaude et le jour de promotion.
- La profondeur requise, les rétentions source et sortie, et le dernier jour finalisé.
- La frontière protégée de la table froide.
- La plage maximale et la taille de chaque lot.
- La règle de priorité entre `hot` et `cold`.
- La stratégie d'idempotence et le verrou de concurrence.
- Les contrôles de source, staging, sortie et publication.
- Le journal avec `run_id`, plage, statut, volumes, durée et version du code.
- Le watermark de la dernière partition publiée et validée.

Garder l'identité d'écriture hors de l'app. L'app reçoit uniquement `SELECT` sur la sortie publiée.
