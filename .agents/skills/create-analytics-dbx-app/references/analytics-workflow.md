# Un seul parcours, du besoin à la mise en service

Lire ce guide pour créer ou faire évoluer une app analytics avec une personne qui porte aussi les données et les KPI.
Adapter la profondeur au résultat demandé : une démo locale, une app sur données réelles ou une mise en production.
Une évolution ciblée reprend les étapes affectées et leurs dépendances. Elle ne recommence pas tout le parcours.

## Réduire les décisions demandées

Commencer par la décision à prendre et un exemple de résultat utile. Déduire du contexte le public, la première page
et le périmètre ; demander seulement les inconnues qui peuvent changer le résultat. Réutiliser la spec, les contrats,
le code et les réponses déjà données. Recommander un choix technique avec sa raison avant de proposer des alternatives.

L'agent exécute les commandes locales avec les valeurs connues. Ne pas renvoyer la personne vers une suite de wizards,
un choix de métier, un catalogue de plugins ou la lecture de tous les skills. Poser une à trois questions bloquantes
à la fois. Une incertitude sur le réel peut laisser avancer une fixture explicitement synthétique.

Par défaut : première tranche petite, mode démo sans credentials, lecture directe, composants Valiuz existants,
capacités AppKit minimales et cache désactivé. Une app déjà connectée conserve son mode de travail.
Une préparation, un filtre, Genie ou un plugin supplémentaire doit répondre à un usage identifié.

## Couvrir les étapes utiles

Ces étapes se recouvrent : vérifier une définition peut conduire à revoir une source avant de construire la page.
L'agent conduit le travail sans passage de relais entre métiers.

| Étape | Travail de l'agent | Trace ou preuve attendue |
| --- | --- | --- |
| Besoin | Relier utilisateur, décision et succès à une première tranche | `config/app-spec.yml` ; brief synchronisé par `app guide` |
| Sources et qualité | Réutiliser ou découvrir les sources autorisées ; vérifier grain, clés, nulls, cardinalités et fraîcheur utiles | Déclarations d'accès et contrats `data/contracts/`, avec inconnues et preuves datées |
| Définitions et calculs | Fixer population, formule, unité, période, fuseau, exclusions et comparatif pertinent ; consulter `validate-analytics-kpis` avant le SQL | Contrat de feature, cas limites et résultat attendu établi indépendamment |
| Préparation | Garder `direct` si possible ; justifier notebook ou pipeline par le grain, le coût, l'historique ou la fraîcheur | Contrat data existant ; bornes et SQL relus si préparation |
| Interface | Construire le chemin page → API → service → repository ; expliciter source, période et fraîcheur lorsque disponibles | Parcours utilisable, filtres nécessaires, chargement, vide, erreur, retard, clavier et mobile |
| Vérification | Tester calculs et contrats, puis l'usage et les contrôles du repository ; corriger les échecs | Commandes et résultats effectifs pour les fichiers concernés |
| Mise en service et suivi | Préparer la connexion réelle puis la livraison demandée, les smoke tests, le rollback et les contrôles de fraîcheur | Cibles et accès revus, révision déployée et recette distante lorsqu'elle est autorisée |

Pour les sources, lire [data-discovery.md](data-discovery.md). Pour une transformation ou un historique nécessaire,
lire [data-preparation.md](data-preparation.md). Pour le code et les tests, lire [delivery.md](delivery.md).
Consulter les skills amont au moment de l'action, via [appkit-capabilities.md](appkit-capabilities.md).
Un Job de préparation n'implique pas l'adoption du plugin Jobs dans l'app.

## Ne pas confondre les preuves

Un générateur KPI avec `count`, `sum` ou `avg` accélère la première tranche. Proposer une comparaison uniquement si
la variation temporelle répond à la question métier. `app feature --date-column <DATE>` ajoute les fenêtres et les écarts ;
`--breakdown-column <dimension>` ajoute un filtre commun et les contributions pour `count` ou `sum`.
Lire `docs/period-comparison.md` pour les dates, valeurs nulles, moyennes pondérées et limites. Vérifier le calendrier,
la couverture et l'additivité avant le waterfall. Ne pas produire une décomposition de taux ou moyenne par simple soustraction de segments.
Le générateur ne fournit pas automatiquement les autres filtres métier, jointures, exports ou contrôles de fraîcheur.
Construire et tester ces comportements s'ils font partie du besoin.
Ne jamais afficher une fraîcheur mesurée depuis une simple fréquence déclarée.

Si le besoin inclut la diffusion d'une comparaison, suivre [sharing.md](sharing.md).
Le partage reste facultatif. Il copie une synthèse contextualisée et un lien de reprise, sans stockage de résultats.

Un faux `SqlExecutor` qui retourne 42 prouve le transport et le contrat de lignes, pas la formule exécutée par Databricks.
Pour un calcul local, tester un jeu synthétique dont le résultat a été établi séparément. Pour le SQL, relire le grain,
les jointures et les paramètres ; une preuve d'exécution du calcul demande une requête bornée sur la cible convenue.
Conserver explicitement la réserve tant que cette preuve manque.

La qualité se vérifie avec des contrôles proportionnés : doublons sur la clé, valeurs nulles indispensables,
volumes avant/après jointure, couverture temporelle et fraîcheur. Une comparaison de périodes demande aussi
des fenêtres comparables. Ne conserver dans le repository que les conclusions non sensibles et les contrats.

## Savoir quand le résultat est atteint

- **Démo** : tranche demandée testée localement sur données synthétiques. L'accès et la qualité réels restent à vérifier.
- **Données réelles** : identité et objets convenus, calculs et qualité contrôlés, UI vérifiée dans ce contexte.
- **Mise en service** : livraison autorisée sur une révision identifiée, smoke tests, rollback et suivi documentés.

Ne pas élargir une demande de démo à un déploiement. Pour une demande plus large, poursuivre les actions locales utiles
et préparer un résultat concret avant la confirmation d'une mutation distante. Réutiliser les autorisations déjà données.
Voir `docs/local-development.md` et `docs/deployment.md` pour les commandes et les cibles.

Conserver la reprise dans `docs/creation-progress.md` selon [orchestration.md](orchestration.md).
Après une étape significative, dire brièvement ce qui fonctionne, la principale inconnue et la prochaine action.
Une même personne peut tenir toutes les responsabilités ; identifier un autre validateur seulement si le contexte l'exige.

## Quand Genie accompagne l’analyse

Suivre [le parcours Genie](genie.md) pour préparer le Space et ses questions de référence.
Une comparaison peut ouvrir une question préremplie avec périodes, filtres, valeurs et réserves visibles.
Utiliser seulement une comparaison appliquée et un Space couvrant les mêmes sources et définitions.
Conserver ce contexte en mémoire ; ne pas persister les valeurs, réponses ou résultats dans l’état personnel.
Une contribution mesurée ne suffit pas à expliquer une cause.
