# Versions et mises à niveau du template

## Contrat

`template/manifest.yml` est la source de vérité pour la version du template. Il déclare les versions, les capabilities
et les guides de mise à niveau. La version de `package.json` reste propre à l'application.

Une capability décrit un contrat observable. Ses sondes contrôlent des fichiers, des marqueurs ou des commandes npm.
`npm run template:check` échoue si une capability déclarée ne correspond pas au checkout.

`init-app` crée `.valiuz-template.yml`. Ce fichier appartient à l'app générée et doit rester dans Git. Il ne contient
ni credential, ni configuration du workspace, ni donnée métier.

## Versions disponibles

| Version | Point historique | Contenu |
| --- | --- | --- |
| `1.0.0` | `05d914c6863c92304b1bc662e40c17e0f97b2c29` | Parcours guidé, accès déclarés, préparation optionnelle, shell Valiuz et bundle Databricks |
| `1.1.0` | `5df063bd0dc7b3664f1bf2cbe624119ddf5568ac` | Compatibilité de déploiement, parcours consommateur propre et suivi de version |
| `1.2.0` | `a1ed6bc333c8b8355641b17f74fe3ed0fb200815` | Historisation à coût borné et gouvernance automatique des releases et de la documentation |
| `1.3.0` | `08058f189790546146dabec88a6a0897568b55e9` | Visualisations analytics réutilisables, page de démonstration et modes clair/sombre |
| `1.4.0` | `19ade7c5882aeb3065453e0aaf3c02552a61fd6c` | Assistant Genie OBO, contexte de dashboard, résultats riches et épinglage composable |
| `1.5.0` | `26a1d0a64a9fed4d0a9cad1c7031a9d2c07eb95f` | Analyses et préférences personnelles optionnelles sur tables Delta de développement |
| `2.0.0` | `8b779bcb363a7c57bdea12342964601d0acdfef4` | Runtime AppKit, routes React, adaptateurs bornés, parcours de capacités et skills amont |
| `2.0.1` | `ba98c16999674181c76a65a5efd5a4e7bdf7cd7e` | Résultats SQL JSON vides confirmés, sans nouvelle capability |

Le point historique est le SHA complet de la branche de base examinée pour préparer la version. Il sert à borner le
diff, pas à reproduire seul le checkout final. Le manifeste et ses sondes définissent le contrat réel de la version.
Ils acceptent les adaptations métier qui conservent ce contrat.

## Nouvelle app

Initialiser l'app, puis afficher son état :

```bash
npm run init-app -- <nom>
npm run template:status
npm run template:check
```

Une nouvelle app reçoit la version `2.0.1`. `npm run check` inclut `template:check` et
`template:release:check`. Le second reconnaît une app initialisée et n'exige aucun bump pour ses features métier.

La release 2.0.0 inclut le parcours de capacités, de skills et l'orchestration de la création ou de la reprise.
Elle ajoute l'entrée `npm run app`, un prompt pour tout le parcours et un bilan de migration depuis un checkout cible.
La migration du runtime impose une version majeure par rapport à la base 1.5.0.
La comparaison facultative et le waterfall rejoignent la **2.0.0** sous la capability `period-comparison`.
Ces ajouts ont été intégrés pendant la préparation de la 2.0.0. Les features existantes restent inchangées.
La capability `comparison-sharing` fait aussi partie de cette version.
Elle ajoute un lien de reprise et une synthèse à copier, avec activation explicite par comparaison.
Elle ne change ni le stockage ni les droits. Les liens recalculent les données sur des dates fixes.
Fusionner les contrats et composants indiqués dans le guide ; les activer selon [le besoin analytique](period-comparison.md).
Les anciennes specs restent lisibles. Fusionner les scripts de cadrage et régénérer le brief pour adopter le nouveau champ `capabilities`.
Ajouter la commande `app:orchestrate` et sa référence au skill de création. Aucun changement de schéma ni nouveau service n'est nécessaire.
Ajouter aussi `app: node scripts/app.mjs` dans les scripts npm. Voir [le parcours CLI](cli-workflow.md).
Les notes de reprise sont facultatives ; elles ne remplacent ni les contrats métier ni les tests.

## App copiée avant le suivi de version

Créer une pull request dédiée à l'adoption du manifeste. Copier `template/`, `scripts/template-manifest.mjs`,
`scripts/template-status.mjs` et `scripts/check-template-release.mjs`. Ajouter aussi les commandes `template:*` de
`package.json`.

Contrôler la baseline `1.0.0` avant de créer l'état :

```bash
npm run template:check -- --to 1.0.0
```

Si ce contrôle réussit, créer `.valiuz-template.yml` avec ce contenu :

```yaml
schemaVersion: 1
template:
  id: valiuz/analytics_dbx_app_template
  repository: https://github.com/valiuz/analytics_dbx_app_template
  version: 1.0.0
capabilities:
  - guided-app-workflow
  - declared-data-access
  - optional-data-preparation
  - valiuz-app-shell
  - databricks-app-bundle
appliedUpgrades: []
```

Si le contrôle échoue, ne déclarez pas cette baseline. Examinez les écarts et choisissez la dernière version réellement
présente dans l'app.

## Passage de 1.0.0 à 1.1.0

Afficher le guide sémantique :

```bash
npm run template:diff -- --from 1.0.0 --to 1.1.0
```

Appliquer les changements guidés dans une branche dédiée. Conserver les choix métier et les contrats de données de
l'app. Puis contrôler les capabilities cibles :

```bash
npm run template:check -- --to 1.1.0
```

Si ce contrôle réussit, modifier `.valiuz-template.yml` :

- Remplacer `version: 1.0.0` par `version: 1.1.0`.
- Ajouter les capabilities `databricks-deployment-compatibility`, `clean-template-consumer-journey` et
  `template-version-tracking`.
- Ajouter `1.0.0-to-1.1.0` à `appliedUpgrades`.

Exécuter ensuite les validations locales :

```bash
npm run template:status
npm run app:doctor
npm run check
```

Une app `1.0.0` applique ensuite chaque guide dans l’ordre, jusqu’au guide `2.0.0 → 2.0.1`.
`template:status` propose la prochaine étape disponible au lieu de sauter une migration intermédiaire.

## Passage de 1.1.0 à 1.2.0

Afficher le guide sémantique :

```bash
npm run template:diff -- --from 1.1.0 --to 1.2.0
```

Appliquer les changements guidés sans remplacer les contrats data ou les adaptations métier de l'app. La reprise
`bounded-replace` reste optionnelle à l'usage, mais ses garde-fous et son skill font partie du contrat `1.2.0`.

Contrôler les capabilities avant de modifier l'état :

```bash
npm run template:check -- --to 1.2.0
```

Si ce contrôle réussit, modifier `.valiuz-template.yml` :

- Remplacer `version: 1.1.0` par `version: 1.2.0`.
- Ajouter `cost-aware-data-history` et `feature-release-governance` aux capabilities.
- Ajouter `1.1.0-to-1.2.0` à `appliedUpgrades`.

Exécuter ensuite `npm run template:status`, `npm run app:doctor` et `npm run check`.

## Passage de 1.2.0 à 1.3.0

Afficher le guide sémantique :

```bash
npm run template:diff -- --from 1.2.0 --to 1.3.0
```

Appliquer les changements guidés sans remplacer les composants métier, la navigation ou les styles propres à l'app.
Installer les dépendances avec npm afin de fusionner correctement `package.json` et `package-lock.json`. Les composants
restent génériques : l'app leur transmet des données déjà agrégées et ne leur donne accès à aucun credential ou module
serveur. La route `/visualizations` utilise uniquement des données synthétiques. Si l'app possède déjà cette route,
fusionner la démonstration avec la page existante au lieu de l'écraser.

Contrôler la capability avant de modifier l'état :

```bash
npm run template:check -- --to 1.3.0
```

Si ce contrôle réussit, modifier `.valiuz-template.yml` :

- Remplacer `version: 1.2.0` par `version: 1.3.0`.
- Ajouter `reusable-analytics-visualizations` aux capabilities.
- Ajouter `1.2.0-to-1.3.0` à `appliedUpgrades`.

Exécuter ensuite `npm run template:status`, `npm run app:doctor` et `npm run check`. Vérifier visuellement
`/visualizations` en modes clair et sombre, au clavier, sur mobile et avec un zoom navigateur à 200 %.

## Passage de 1.3.0 à 1.4.0

Afficher le guide sémantique :

```bash
npm run template:diff -- --from 1.3.0 --to 1.4.0
```

Appliquer les changements dans une branche dédiée. Conserver les dashboards, les alias et les Space ID propres à
l’application. Installer les dépendances avec npm. Ne pas remplacer le fichier `package-lock.json` de l’application.

Fusionner le service Genie et la route SSE avec les couches serveur existantes. Le jeton OBO reste dans la portée de
la requête. Les questions, le SQL, les résultats et les en-têtes d’autorisation restent hors des logs.
Conserver la limite de corps à 64 Kio et les quotas de flux actifs. Seuls les `GET` de statut et de résultat peuvent
être retentés. Ne jamais rejouer automatiquement le `POST` de soumission.

Ajouter les Spaces dans `config/genie-spaces.json`. Puis générer la ressource application :

```bash
npm run data:access:render
```

Examiner le scope `genie` et chaque binding `CAN_RUN`. Conserver une seule définition `resources.apps.app` dans le
bundle. Configurer les droits et le consentement utilisateur dans le workspace avant le déploiement.

Valider la capability avant de modifier l’état :

```bash
npm run template:check -- --to 1.4.0
```

Si la validation réussit, modifier `.valiuz-template.yml` :

- Remplacer `version: 1.3.0` par `version: 1.4.0`.
- Ajouter `genie-natural-language-analytics` aux capabilities.
- Ajouter `1.3.0-to-1.4.0` à `appliedUpgrades`.

Exécuter `npm run template:status`, `npm run app:doctor`, `npm run test:e2e` et `npm run check`.
Examiner `/genie` en modes clair et sombre. Examiner aussi le clavier, le mobile et le mouvement réduit.

## Préparer la version après une feature du template

`AGENTS.md` demande automatiquement les skills `prepare-template-release` et `review-analytics-app-docs` après un
changement de comportement, de configuration, de workflow ou de skill partagé. Il n'est pas nécessaire de les nommer
dans chaque session.

Le contrôle déterministe utilise la branche ou le SHA de base :

```bash
npm run template:release:check -- --base origin/main
```

Il vérifie le bump SemVer, le `sourceCommit`, les capabilities, le guide direct, `README.md` et ce document. La CI lui
transmet le SHA de base de la pull request ou du push. Par prudence, toute modification hors `README.md`, `docs/` et
`tests/` demande une release ; le manifeste lui-même appartient au contrat. Le contrôle ne crée aucun commit, tag,
pull request ou release.

## Limites du MVP

Le MVP ne télécharge aucun fichier et ne crée aucune pull request. Il ne fusionne pas automatiquement les changements
du template dans une app. Cette limite protège les features, les requêtes et les choix de déploiement propres à l'app.

Le manifeste utilise le versionnage sémantique :

- Une version patch corrige le contrat sans ajouter de capability.
- Une version minor ajoute une capability compatible avec le parcours existant.
- Une version major exige une migration qui peut modifier le contrat d'une app.

## Passage de 1.4.0 à 1.5.0

Cette version mineure ajoute `personal-user-state`, désactivé par défaut. Aucun stockage ni droit distant ne change
pendant la mise à niveau du code. Le layout devient dynamique pour lire les options runtime après le build.

```bash
npm run template:diff -- --from 1.4.0 --to 1.5.0
```

Fusionner les contrats, les routes personnelles et les composants. Conserver la navigation et les filtres métier de
l’app. Adapter les variantes strictes de définition et les préférences avant activation. La feature IKEA existante
n’est pas migrée automatiquement ; conserver ses tables, ses versions et ses garanties de concurrence.

Si l'état personnel est demandé, suivre [le guide personnel](user-state.md) pour préparer les deux tables, relire les
bindings et effectuer la recette distante. Sinon, garder le flag désactivé, sans table ni nouveau droit.
Les sources analytiques restent en lecture seule.

```bash
npm run template:check -- --to 1.5.0
```

Après validation, remplacer la version dans `.valiuz-template.yml`, ajouter `personal-user-state` aux capabilities
et `1.4.0-to-1.5.0` à `appliedUpgrades`. Exécuter `npm run check`. La création des tables et le déploiement sont des
mutations distinctes. Désactiver la feature pour un rollback ; ne pas effacer les données personnelles.

## Passage de 1.5.0 à 2.0.0

Cette version majeure change le runtime et le modèle d’écriture des pages et handlers.
Les données et requêtes métier restent en place. Les apps 1.4.0 et 1.5.0 ne migrent pas automatiquement.

Une app 1.4 applique d'abord les contrats 1.5, sans activer le stockage personnel si inutile.
React reste présent ; le runtime Next.js et le routage sont portés vers AppKit/Express, Vite et React Router.
Installer les dépendances d'un checkout 2.0 relu, distinct de l'app, puis y lancer :

```bash
npm run app -- migrate --app-dir /chemin/vers/ancienne-app
```

Ce bilan compose les guides 1.4 → 1.5 → 2.0 ou le guide 1.5 → 2.0. Il ne modifie ni l'app ni sa version.
L'ancienne copie du manifeste ne découvre pas automatiquement les releases futures.

Suivre [la migration détaillée](migration-2.0.md). Depuis le checkout cible, afficher le guide direct :

```bash
npm run template:diff -- --from 1.5.0 --to 2.0.0
```

Dans le repository source avec son historique 1.4 et 1.5, `npm run template:migration` vérifie les deux fixtures métier.

Les sondes `fileAnyOf` reconnaissent les emplacements 1.x et 2.0 des capabilities conservées.
Les nouvelles capabilities vérifient le runtime AppKit, sa maintenance et le parcours guidé des capacités et skills.
Le parcours de création suppose une personne pour le besoin, les données et l'app. `app prompt --idea <besoin>`
ne demande aucun profil ; les anciennes valeurs de `--role` restent des priorités facultatives.
`app next` expose aussi les revues métier, qualité, calcul, préparation, interface, tests et livraison.
Fusionner les références du skill et conserver les contrats et notes existants, sans relancer l'initialisation.
Le rollback conserve les tables et redéploie la révision précédente.

La 2.0.0 inclut aussi `appkit-genie-integration` : plugin Genie programmatique, compatibilité OBO et
annulation, identité visible et exploration facultative des comparaisons. Les contrats et limites sont décrits dans
[Genie](genie.md). Cette addition reste dans la migration major 1.5 → 2.0 ; les tables personnelles sont préservées.

La capability `comparison-sharing` ajoute le partage facultatif à la même migration 1.5 → 2.0.
Fusionner ses modules, ses options de génération et la référence de skill indiqués dans le guide YAML.
Une app existante conserve le partage désactivé tant qu'elle ne fournit pas la prop `sharing`.
Avant activation, examiner les filtres partageables et tester la reprise du lien sur la bonne vue.
Après validation, ajouter `comparison-sharing` aux capabilities de `.valiuz-template.yml` avec les autres contrats 2.0.
Voir [le contrat de partage](period-comparison.md#partager-une-comparaison) pour la distinction entre copie datée et recalcul.

La 2.0.0 fixe aussi un seul contrat d’écriture d’app : handlers Express natifs, paramètres SQL nommés et événements
Genie alignés sur AppKit. Les anciens handlers, paramètres positionnels et événements enveloppés ne sont pas acceptés
au runtime. Les guides et fixtures réalisent ce portage une fois, sans modifier les calculs métier ni les données stockées.
Ces ruptures ont été intégrées pendant la préparation de la version majeure 2.0.0.

## Passage de 2.0.0 à 2.0.1

Ce patch corrige le résultat vide de Statement Execution avec AppKit 0.76.1. Une requête réussie peut renvoyer
`result: {}` ; sans adaptation, le contrat strict de l’executor rejette ce résultat et `/api/readiness` renvoie 502.

```bash
npm run template:diff -- --from 2.0.0 --to 2.0.1
```

Fusionner le changement de `guardStatementClient` dans `src/server/workspace-client.ts`, le registre de compatibilité
et le test `tests/fixtures/appkit-contract.ts` selon le [guide YAML](../template/upgrades/2.0.0-to-2.0.1.yml).
Conserver les personnalisations du client, les requêtes, les types, les délais, les limites et les écritures personnelles.
Les dépendances et les capabilities restent inchangées.

Le client fournit `data_array: []` seulement après `SUCCEEDED`, avec format `JSON_ARRAY`, un schéma de colonnes,
zéro ligne et zéro chunk déclarés, sans troncature ni données ou chunk suivant. Les résultats incomplets restent
des erreurs. Il n’y a ni nouvelle soumission ni bascule vers le driver après exécution.

Valider les résultats vides et non vides avec le package AppKit installé, ainsi que les erreurs, la troncature et
la soumission unique. Après les validations du guide, mettre à jour `.valiuz-template.yml` vers `2.0.1`, conserver
les capabilities de `2.0.0` et ajouter `2.0.0-to-2.0.1` à `appliedUpgrades`, puis relancer `app:doctor` et `check`.
La recette Databricks après déploiement autorisé vérifie `/api/readiness` et une vue métier vide ; ce patch
ne demande ni écriture SQL ni changement de droits.
