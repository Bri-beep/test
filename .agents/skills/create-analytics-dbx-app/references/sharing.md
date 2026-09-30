# Diffuser une comparaison avec son contexte

Lire cette référence pour ajouter un lien de reprise et une synthèse à copier depuis une comparaison.
Le contrat détaillé et l'API figurent dans [le guide de comparaison](../../../../docs/period-comparison.md#partager-une-comparaison).
Ne pas activer ce partage sur toutes les pages par défaut.

## Choisir le périmètre

Utiliser cette option lorsque le destinataire doit retrouver les périodes et filtres d'un résultat consulté.
Le lien recalcule les données courantes avec les accès habituels de l'app. Il n'accorde aucun droit supplémentaire.
La synthèse conserve les chiffres consultés, leurs réserves et la date de consultation.
Cette date ne mesure pas la fraîcheur de la source.

Pour une nouvelle comparaison, utiliser `--share-analysis` avec `--date-column`.
Pour une comparaison existante, fournir `sharing` avec une clé stable propre à sa définition métier.
Ne pas relancer le générateur sur son slug existant.

Examiner les valeurs de la dimension avant d'autoriser leur présence dans un lien.
`--share-segment` exige `--share-analysis` et `--breakdown-column`.
Dans un composant existant, cette décision correspond à `allowSegment: true`.
Garder les identifiants personnels et les segments sensibles hors du lien.
Si une vue possède d'autres filtres, étendre explicitement le contrat avant d'activer son partage.

## Vérifier le résultat

Vérifier que le lien reprend les deux périodes résolues et le filtre réellement appliqué.
Refuser les définitions invalides et les segments non autorisés sans afficher une autre comparaison par défaut.
Conserver les réserves du résultat dans la synthèse. Vérifier aussi le mode démo et la copie manuelle.
Le partage ne conserve ni résultat, SQL, réponse Genie, ni identifiant d'analyse personnelle dans son lien.
Les tables d'état personnel restent privées et inchangées.

L'utilisateur choisit le destinataire et colle le contenu. Cette option n'autorise aucun envoi automatique vers Slack ou une autre application.
