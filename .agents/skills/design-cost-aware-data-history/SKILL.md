---
name: design-cost-aware-data-history
description: >-
  Concevoir ou auditer une historisation Databricks avec des reprises bornées et un coût maîtrisé. Utiliser pour
  corriger une période, conserver un historique ou choisir entre remplacement borné et architecture hot/cold.
---

# Mission

Définir le plus petit mécanisme qui conserve l'historique utile et permet une reprise ciblée. Produire un contrat
reproductible avant de créer un Job, une pipeline ou une table.

# Examiner le besoin

Lire `AGENTS.md`, `README.md`, `docs/architecture.md` et `docs/databricks.md`. Examiner ensuite les contrats sous
`data/contracts/` et le manifeste `config/data-access.json`.

Établir les faits suivants :

- Le grain métier et sa clé unique.
- La colonne `DATE` qui limite les lectures et les écritures.
- La rétention de la source et sa fenêtre de correction.
- La profondeur d'historique et la fraîcheur nécessaires.
- La rétention maximale de la sortie.
- Le dernier jour finalisé et le fuseau horaire métier.
- Les consommateurs, le propriétaire et la sensibilité des colonnes.
- La fenêtre normale, la fenêtre maximale et le timeout.

Marquer une information `À confirmer` si aucune preuve ne la confirme. Ne pas lire ni copier des lignes métier pour
compléter le contrat.

# Choisir une stratégie

Utiliser cet ordre :

1. Garder le mode `direct` si la source fournit l'historique et la performance nécessaires.
2. Utiliser un notebook `bounded-replace` pour une table propre à l'app. La rétention source doit couvrir la rétention
   de sortie et le délai de finalisation.
3. Utiliser une pipeline avec une fenêtre chaude si le calcul récent est fréquent ou complexe.
4. Créer un data product hot/cold séparé si la source expire ou si plusieurs apps consomment l'historique.

Ne pas ajouter une pipeline pour remplacer une requête directe courte. Ne pas placer un data product partagé dans le
repository d'une app mono-mainteneur.

Lire [references/patterns.md](references/patterns.md) pour les critères hot/cold, les preuves issues des trois projets
de référence et les pièges à éviter.

# Créer une reprise bornée

Le starter du template couvre le cas notebook simple :

```bash
npm run data:init -- ventes-historisees \
  --mode notebook \
  --source dev-dtm-media-pm.raw.ventes \
  --output dev-dtm-media-pm.analytics.ventes_historisees \
  --columns sale_date,store_id,revenue \
  --keys sale_date,store_id \
  --replay-strategy bounded-replace \
  --date-column sale_date \
  --default-lookback-days 7 \
  --max-replay-days 31 \
  --finalization-lag-days 1 \
  --required-history-days 365 \
  --output-retention-days 365 \
  --source-retention-days 730
```

La colonne de reprise doit être une `DATE`. Elle doit aussi appartenir aux colonnes et à la clé du contrat. Vérifier
son type et le pruning physique avec les métadonnées Databricks. Le générateur local ne peut pas prouver ces deux faits.

Le starter matérialise une table temporaire de session. Il valide cette tranche, puis publie avec `BY NAME` et
`REPLACE WHERE`. Confirmer que le SQL Warehouse prend en charge les tables temporaires avant la première écriture.
Ajouter des contrôles de complétude propres au métier avant la commande de publication.

Le starter fixe actuellement le calendrier à `Europe/Paris` pour `current_date()`, le jour finalisé et les schedules.
Si le fuseau métier attendu diffère, adapter et tester le contrat avant de générer ou d'exécuter le Job.

Une nouvelle sortie utilise le liquid clustering sur la date. Vérifier le provider, le schéma et le layout d'une
sortie existante. Le starter ne convertit pas cette table.

Mesurer `sourceRetentionDays` depuis la date courante. `outputRetentionDays` fixe la purge maximale de la sortie.
`requiredHistoryDays` fixe la couverture minimale attendue par l'app. Ne pas confondre ces deux dernières valeurs.
Ne pas traduire une durée en mois calendaires par un nombre de jours sans validation métier.

Afficher une reprise sans mutation :

```bash
npm run data:replay -- ventes-historisees \
  --profile <profil> \
  --start-date 2026-08-01 \
  --end-date 2026-08-07
```

Avant `--confirm`, montrer le workspace, le profil, la target, le projet, la source, la sortie et la plage. Une reprise
écrit dans Delta et démarre du compute.

Charger l'historique initial avec des plages contiguës qui respectent `maxDays`. Le starter ne conserve pas de
checkpoint. Choisir un data product si ce chargement exige une orchestration durable ou une reprise automatique.

# Garde-fous obligatoires

- Limiter chaque lecture source à la plage demandée et à ses partitions physiques.
- Refuser une plage inversée, future ou plus grande que `maxDays`.
- Refuser une date postérieure au dernier jour finalisé.
- Matérialiser la plage source avant ses contrôles.
- Refuser la publication si le staging est vide, si une clé est nulle ou si le grain est dupliqué.
- Utiliser une écriture atomique par plage ou un staging validé avant publication.
- Épingler la version source si la source Delta et le risque du backfill le justifient.
- Garder `max_concurrent_runs: 1` et un timeout non nul.
- Garder les schedules en pause jusqu'au premier run manuel réussi.
- Ne pas utiliser `full_refresh` pour corriger une plage.
- Ne pas lancer `OPTIMIZE` global après chaque petite reprise.
- Valider le grain, les bornes, les volumes agrégés et la fraîcheur après l'écriture.
- Séparer la profondeur requise de la rétention maximale de la sortie.
- Supprimer seulement les dates antérieures à la rétention de sortie déclarée.
- Journaliser le run, la plage, le statut, les volumes et la durée pour un data product durable.

Pour un data product durable, séparer les étapes `plan`, `stage`, `validate`, `publish` et `record`. Avancer le
watermark seulement après une publication validée.

Une écriture distante, un déploiement, un grant ou une activation de schedule demande une autorisation explicite. Une
demande de reprise n'autorise pas un reset, un `recreate` ou un recalcul complet.

# Résultat attendu

Terminer avec :

- La stratégie retenue et les options rejetées.
- Le contrat de grain, date, rétention, correction et fenêtres.
- Les ressources créées, ou l'absence de nouvelle ressource.
- Le plan de reprise et ses contrôles avant et après l'écriture.
- Les commandes réellement exécutées et les actions distantes non exécutées.
- Les inconnues qui empêchent une activation planifiée.
