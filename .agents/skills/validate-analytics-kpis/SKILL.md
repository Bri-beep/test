---
name: validate-analytics-kpis
description: Auditer un KPI, une requête ou une visualisation analytics avant partage en vérifiant le contrat métier, la qualité des sources, les calculs et les risques statistiques.
---

# Mission

Déterminer si un chiffre est assez fiable pour guider une décision. Relier chaque résultat à sa définition, ses sources,
son calcul et ses limites, puis rendre un verdict clair sans transformer une simple revue en projet data supplémentaire.

# Définir ce qui doit être vrai

Lire les instructions du repository, `docs/product-brief.md`, les contrats de feature, les requêtes, repositories,
services, fixtures et tests concernés. Pour chaque KPI, établir ou faire confirmer :

- la décision et la population couvertes ;
- la formule, le numérateur, le dénominateur, l'unité et l'arrondi ;
- le grain, la période, le fuseau horaire, les filtres et le comparatif ;
- les sources, clés, cardinalités, règles d'exclusion et délai de fraîcheur ;
- le résultat attendu pour une période vide, une valeur inconnue ou une source en retard.

Marquer toute information absente `À confirmer`. Poser au maximum trois questions à la fois et commencer par celles qui
peuvent changer la décision ou invalider le calcul.

# Choisir une preuve proportionnée

Commencer par la preuve locale : contrats Zod, SQL, code de calcul, tests et fixtures synthétiques. Recalculer le KPI
avec un faux `SqlExecutor` ou un jeu minimal connu lorsque cela suffit.

Une requête distante doit rester en lecture seule, nommée, paramétrée, limitée et bornée par un timeout. Avant de
l'exécuter, confirmer le workspace, le warehouse, le catalog, le schema et les objets lus. Ne pas déclencher de grant,
de SQL d'écriture ou de déploiement. Ne pas copier de lignes sensibles dans un rapport, un test, un log ou un prompt.

Lire [references/review-checklist.md](references/review-checklist.md) pour sélectionner les contrôles de qualité,
calcul, statistique et visualisation qui correspondent réellement au KPI. Ne pas exécuter mécaniquement tous les
contrôles.

Pour une comparaison ou un waterfall, lire `docs/period-comparison.md` lorsqu'il est présent. Vérifier les mêmes filtres,
les dates civiles, durées, périodes partielles et références nulles ou négatives. Une moyenne exige des pondérations.
Réconcilier référence + contributions + résidu avec le total analysé ; les segments doivent être disjoints et la mesure additive.
Un taux, une moyenne ou un stock non additif demande une méthode spécifique. Une contribution ne prouve pas une cause.

# Vérifier la chaîne complète

1. Retracer la source jusqu'au chiffre affiché : objet, requête, repository, service, route et composant.
2. Vérifier le grain avant toute jointure et comparer les volumes avant/après pour détecter pertes et multiplications.
3. Reproduire numérateur et dénominateur séparément, puis vérifier unités, arrondis, périodes et pondérations.
4. Comparer l'implémentation à la définition métier et aux libellés visibles, pas seulement à une valeur attendue codée
   dans un test.
5. Examiner les états vide, incomplet ou en retard afin qu'une absence de donnée ne ressemble pas à un zéro métier.
6. Ajouter ou corriger des tests déterministes lorsqu'une erreur observable est trouvée et que la demande comprend la
   modification du code.

Appliquer une revue statistique seulement lorsqu'une conclusion dépasse la description des données : évolution,
comparaison de groupes, expérimentation, anomalie, prévision ou relation entre variables. Exiger alors la taille
d'échantillon, l'incertitude, l'effet mesuré, les hypothèses et les biais plausibles. Ne pas présenter corrélation comme
causalité.

# Rendre le verdict

Produire une synthèse courte avec l'un de ces statuts :

- `VALIDÉ` : définition, source, calcul et représentation sont cohérents avec une preuve suffisante ;
- `VALIDÉ AVEC RÉSERVES` : le chiffre est utilisable dans un périmètre explicite malgré des limites non bloquantes ;
- `NON VALIDÉ` : une incohérence ou une preuve manquante peut changer l'interprétation ou la décision.

Pour chaque finding, donner le KPI, la preuve observée, l'impact, la correction minimale et le propriétaire attendu.
Distinguer les faits, hypothèses et contrôles non exécutés. Terminer par les commandes réellement lancées et une seule
prochaine action prioritaire.
