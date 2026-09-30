---
name: prepare-template-release
description: >-
  Préparer ou auditer la version d'un template analytics Databricks. Utiliser automatiquement après une feature,
  une correction de comportement, un changement de workflow ou de skill partagé dans le repository source du template.
---

# Mission

Rendre chaque évolution du template traçable et applicable à une app existante. Décider explicitement si le changement
demande une version, puis synchroniser le manifeste, le guide de migration, les tests et la documentation.

# Distinguer le template d'une app

Lire `package.json`, `template/manifest.yml`, `AGENTS.md` et le diff face à la branche de base.

- `name: __PACKAGE_NAME__` désigne le repository source du template. Appliquer le workflow de release ci-dessous.
- Un autre nom désigne une app initialisée. Ne pas augmenter la version du template pour une feature métier. Conserver
  `.valiuz-template.yml`, sauf lorsqu'un guide de mise à niveau du template est effectivement appliqué.
- Une modification documentaire ou de tests sans changement de contrat peut ne demander aucune nouvelle version.

# Choisir la version

Suivre la politique de `docs/template-upgrades.md` :

- `patch` corrige un contrat existant sans ajouter de capability ;
- `minor` ajoute une capability compatible ;
- `major` retire, renomme ou modifie de manière incompatible un contrat d'app.

Ne pas déduire la version de `package.json` : elle appartient à l'application. Utiliser le manifeste du template comme
source de vérité. Le `sourceCommit` d'une nouvelle version est le SHA complet de la branche de base examinée.

# Préparer une release du template

1. Lire le diff complet et nommer les comportements observables ajoutés, corrigés ou retirés.
2. Ajouter la version sous `versions` et les nouvelles capabilities avec des sondes stables dans
   `template/manifest.yml`.
3. Ajouter un guide direct `template/upgrades/<ancienne>-to-<nouvelle>.yml`. Préserver les adaptations métier : une
   migration guidée décrit les changements, elle ne remplace pas des dossiers complets.
4. Mettre à jour au minimum `README.md` et `docs/template-upgrades.md`, puis tous les runbooks dont l'usage réel change.
5. Mettre à jour l'état attendu par `init-app`, le parcours consommateur et les tests de version.
6. Exécuter `npm run template:release:check -- --base <branche-ou-sha>`, puis les validations de `AGENTS.md`.
7. Utiliser `review-analytics-app-docs` pour la revue finale. Corriger les écarts appartenant au changement autorisé.

Le contrôle de release doit échouer si une feature du template n'augmente pas la version, si une capability est ajoutée
dans un patch, si le guide de migration manque ou si le README et le guide des versions n'ont pas été revus.
La politique est volontairement conservatrice : hors `README.md`, `docs/` et `tests/`, tout fichier modifié ou supprimé,
y compris `template/manifest.yml`, demande une décision de release. Il n'existe pas de contournement `no-bump` implicite.

# Limites

Préparer une version reste une modification locale. Ne pas pousser, créer une pull request, fusionner, taguer, publier
une release ou déployer sans autorisation explicite. Signaler dans le handoff la décision SemVer, les documents revus et
les actions distantes non exécutées.

# Runtime AppKit 2.0

Lire `docs/appkit-maintenance.md` et le registre `config/appkit-compatibility.json`.
Consulter la guidance Databricks installée hors du repository pour Apps, auth, SQL et Bundles.
Conserver les règles Valiuz du repository et les exceptions documentées des adaptateurs.
Lorsque l'accompagnement évolue, synchroniser le catalogue des capacités, la spec, le brief, les références de skills et le parcours consommateur.
Vérifier les empreintes des points d'entrée avant de modifier la révision de guidance revue. Ne pas confondre cette révision avec l'installation du poste.
Une migration de runtime demande les parcours consommateur et E2E.
Dans le repository source avec son historique Git, valider aussi les fixtures de migration 1.4 et 1.5.
