# Cadrage produit, données et requêtes

Utiliser ce parcours dès qu'un besoin d'app apparaît ou lorsqu'une application existante manque de cadrage. Le but n'est pas de
remplir un questionnaire : il est de réduire progressivement l'incertitude jusqu'à une première tranche testable.

Après l'action utilisateur et le critère de succès, lire [appkit-capabilities.md](appkit-capabilities.md).
Proposer les capacités utiles et les consigner avec `app:guide --capabilities`.
Ne lire les sections KPI et SQL que si le besoin les utilise. Pour une app fichiers, modèle ou workflow,
cadrer plutôt les entrées, les sorties, l'identité et les effets de chaque action.

## Poser les questions par petits lots

Choisir le prochain lot selon les inconnues qui bloquent réellement l'avancement. Poser au maximum trois questions par
message.
Les listes ci-dessous sont des aides à la décision, pas un formulaire à faire remplir. Une même personne peut porter
le besoin, les données et l'app. Recommander les choix techniques et remplir les commandes depuis les informations connues.

### Résultat métier

- Qui utilisera l'application et quelle décision doit-elle permettre de prendre ?
- Quel problème actuel remplace-t-elle, et à quelle fréquence sera-t-elle consultée ?
- Comment saura-t-on que la première version est utile ?

### KPI et axes d'analyse

- Quels KPI doivent être visibles en premier, avec leur définition métier exacte ?
- Pour chaque KPI : formule, unité, grain, fuseau horaire, période, comparatif, objectif et règle d'arrondi.
- Quelles dimensions et quels filtres sont nécessaires : entité, enseigne, magasin, canal, produit, campagne, date ou
  autre ?

### Sources Databricks

- Quel workspace, warehouse, projet/catalogue autorisé et schema utiliser ?
- Quelles tables ou vues sont autorisées, quel est leur grain et quelles clés permettent les jointures ?
- Quelle fraîcheur, profondeur d'historique et qualité de données sont attendues ? Qui est propriétaire de chaque source ?

Demander des noms d'objets et des contrats de colonnes, pas des exports de lignes sensibles. Si une exploration distante
est utile, proposer d'abord des commandes en lecture seule comme `DESCRIBE TABLE`, `SHOW COLUMNS` ou une agrégation
bornée. Confirmer le workspace, le warehouse, le projet/catalogue et le schema avant de l'exécuter. Ne jamais journaliser les
résultats métier complets.

Lorsque les sources ou leur qualité restent inconnues, suivre
[data-discovery.md](data-discovery.md) et reporter son contrat de source dans le brief avant de concevoir le SQL métier.

### Requêtes et contrats

- Pour chaque vue attendue, quelle question la requête doit-elle résoudre et quels filtres viennent de l'utilisateur ?
- Quel est le schéma de sortie attendu, son grain, son volume maximal et son budget de latence ?
- Que doit-il se passer pour une période vide, une valeur inconnue, un retard de données ou une source indisponible ?

Avant d'écrire le SQL, consigner pour chaque requête : nom stable, objectif, objets lus, paramètres, colonnes de sortie,
grain, limite de lignes, timeout et exemple de critère d'acceptation. Refuser toute concaténation d'entrée utilisateur.

### Expérience et fonctionnalités

- Quelles pages composent le parcours minimal et quelle information doit apparaître au-dessus de la ligne de flottaison ?
- Quels composants sont utiles : cartes KPI, séries temporelles, tableaux, segmentation, drill-down, export, partage ou
  alerte ?
- Quels états faut-il concevoir : chargement, vide, erreur, données en retard, mobile et accessibilité clavier ?

Ne pas ajouter une fonctionnalité simplement parce qu'elle est habituelle dans un dashboard. La relier à une décision
utilisateur ou la placer dans le backlog.

Consulter `databricks-app-design` pour les écrans de données et de conversation, lorsqu'il est installé.
Relier chaque élément au composant Valiuz existant ou au composant AppKit effectivement exporté dans la version installée.
Préserver les médias, Outfit, les tokens, les thèmes et les contrats de visualisation du template.

### Accès et exploitation

- Quels groupes peuvent utiliser ou gérer l'application ? Certaines données demandent-elles un filtrage par utilisateur ?
- Existe-t-il des données personnelles, confidentielles ou soumises à une politique de rétention ?
- Qui valide les chiffres, le rendu fonctionnel et le passage en production ?

## Maintenir `docs/product-brief.md`

Commencer par `npm run app:guide` afin de synchroniser `config/app-spec.yml` et `docs/product-brief.md`. Mettre à jour la
spec après chaque lot significatif, sans remplacer les décisions utilisateur par des hypothèses. Ne pas modifier le
brief généré sans reporter d'abord la décision dans la spec ou le contrat data concerné.

```markdown
# Brief produit

## Objectif et utilisateurs
## KPI, sources et fonctionnalités
## Accès, confidentialité et exploitation
## Backlog
```

Les identifiants techniques non secrets, comme projet/catalogue, schema, table ou warehouse ID, peuvent être documentés si la
politique de l'équipe l'autorise. Les credentials, extraits clients et données personnelles ne le peuvent jamais.

## Définir la prochaine tranche

Une tranche MVP doit relier un besoin utilisateur à un chemin complet : page, route, service, repository, requête ou
fixture, contrat validé et test. Choisir la plus petite tranche qui réduit un risque important, par exemple valider un
KPI prioritaire avec une seule source et un seul filtre. Réutiliser les critères déjà donnés ; demander une précision
seulement si leur ambiguïté peut changer le résultat. Poursuivre l'implémentation locale autorisée.

Le KPI est un exemple, pas un passage obligatoire. Une app Genie peut commencer par une question avec contexte de dashboard.
Une app Files peut commencer par un import validé en démo. Le critère de succès de la spec sert de première preuve.
