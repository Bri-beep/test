# Déploiement

## Une nouvelle application

1. Créer le repository via **Use this template**.
2. Cloner, exécuter `npm ci`, créer une branche et lancer `npm run init-app -- <nom>` une seule fois.
   Contrôler ensuite la version avec `npm run template:status`.
3. Exécuter `npm run app:guide`, puis choisir la source avec `npm run data:init -- <nom-source>`. Garder le mode
   `direct` si une table ou vue existante convient.
4. Créer la première tranche avec `npm run feature:new -- <slug>`, puis relire la spec, le brief, le SQL et les tests.
5. Vérifier le contact Slack et les Spaces dans `config/genie-spaces.json`. Relire aussi `app.yaml` et la ressource générée.
6. Vérifier le workspace prérempli `https://3070470996474403.3.gcp.databricks.com`, le warehouse `team-da-poc`
   (`ab362e9710498a08`), le Space Genie, le projet/schema, les groupes, les sources et le chemin bundle.
7. Lancer `npm run app:doctor` puis `npm run check`.
8. Ouvrir une pull request. Laisser la CI valider le checkout courant et une app générée dans une copie propre.
   Fusionner ensuite dans `main`.
9. Pour un contrat `notebook` ou `pipeline`, exécuter la préparation depuis la révision fusionnée et vérifier que sa
   table de sortie existe.
10. Provisionner l'app une première fois afin que Databricks crée son service principal.
11. Ajouter à ce service principal un credential Git en lecture sur le repository privé.
12. Vérifier le scope utilisateur `genie` et le binding `CAN_RUN` dans le plan du bundle.
13. Déclencher le workflow `Deploy Databricks App` et laisser le smoke distant vérifier les accès runtime.

Le credential Git ne peut pas être configuré avant l'étape de provisioning, car le service principal dédié n'existe
pas encore.

## Mettre à niveau une app issue du template

Conserver les adaptations métier de l'app. Ne remplacer aucun dossier complet avec le contenu du template.

1. Lire [template-upgrades.md](template-upgrades.md).
2. Déclarer la baseline réelle dans `.valiuz-template.yml`.
3. Si l'app est en `1.0.0`, appliquer d'abord le guide `1.0.0 → 1.1.0` et valider cet état.
4. Si l'app est en `1.1.0`, appliquer ensuite le guide `1.1.0 → 1.2.0` et valider cet état.
5. Si l'app est en `1.2.0`, appliquer le guide `1.2.0 → 1.3.0` et valider cet état.
6. Exécuter `npm run template:diff -- --from 1.3.0 --to 1.4.0`.
7. Appliquer chaque changement guidé dans une branche dédiée, sans remplacer les composants métier, la navigation ou
   les styles propres à l'app.
8. Exécuter `npm run template:check -- --to 1.4.0` avant de modifier l'état de l'app.
9. Mettre `.valiuz-template.yml` à `1.4.0`, ajouter `genie-natural-language-analytics` et l'upgrade appliquée.
10. Appliquer ensuite le guide `1.4.0 → 1.5.0`, ajouter `personal-user-state` et exécuter `npm run check`.

Le diff ne contacte ni GitHub ni Databricks. Les commandes de déploiement restent des mutations distantes distinctes.

## Développement local

Le mode démo (`npm run dev`) n'utilise pas Databricks. Pour un test réel, configurer le profil OAuth U2M et les variables
non secrètes en suivant [local-development.md](local-development.md), puis lancer `npm run databricks:check` et
`npm run test:databricks`. Ne jamais utiliser le catalog de production pour tester une opération d'écriture.

## Target dev

Après authentification Databricks CLI et revue de la target, passer le profil explicitement :

```bash
npm run bundle:validate -- --target dev --profile valiuz-analytics-dev
npm run deploy -- --target dev --profile valiuz-analytics-dev
```

La target `dev` téléverse le checkout local. Cette commande crée ou modifie des ressources distantes et démarre l’app.

Le raccourci accompagné affiche d'abord tous ses contrôles et s'arrête sans `--confirm` :

```bash
npm run preview:real -- --profile valiuz-analytics-dev
npm run preview:real -- --profile valiuz-analytics-dev --confirm
```

Il est limité à `dev`, exécute ensuite le préflight distant, déploie et lance les smokes. Ajouter `--prepare-data`
autorise aussi l'exécution de toutes les préparations notebook/pipeline déclarées ; ne pas l'ajouter pour une app en
lecture directe.

`--prepare-data` refuse les contrats `bounded-replace`. Exécuter ceux-ci séparément avec des dates explicites avant la
preview. La commande globale ne choisit jamais une plage historique pour le mainteneur.

## Préparation data avant l'app

Une préparation `notebook` ou `pipeline` est un SQL d'écriture et utilise son propre mini-bundle. L'afficher puis
l'exécuter séparément avant le premier binding `SELECT` de l'app :

```bash
npm run data:prepare -- <contrat> --target dev --profile valiuz-analytics-dev
npm run data:prepare -- <contrat> --target dev --profile valiuz-analytics-dev --confirm
```

La première commande ne modifie rien. La seconde valide et déploie `data/databricks.yml`, exécute le Job puis laisse les
schedules en pause. Vérifier la sortie avant d'utiliser `--activate-schedule`. Le workflow applicatif ne redéploie pas
ce mini-bundle : pour une app interne mono-mainteneur, la préparation évolue explicitement lorsque son contrat ou son
SQL change.

Ajouter `--start-date` et `--end-date` aux deux commandes pour un contrat `bounded-replace`.

Pour un contrat `bounded-replace`, une reprise ultérieure ne déploie pas le bundle :

```bash
npm run data:replay -- <contrat> \
  --target dev \
  --profile valiuz-analytics-dev \
  --start-date 2026-08-01 \
  --end-date 2026-08-07
```

Examiner le plan. Ajouter `--confirm` pour démarrer le Job. La plage doit rester dans la limite du contrat.
Les deux dates sont obligatoires. Le plan affiche aussi le warehouse attendu par le bundle local, le jour finalisé et
la couverture requise. En reprise seule, il indique explicitement que le warehouse et le schedule du Job déployé ne
sont pas interrogés. Vérifier ces réglages dans Databricks si leur état réel intervient dans la décision d'exécution.
Exécuter cette commande depuis la révision du dernier `data:prepare`. Le fingerprint du contrat et du SQL fait échouer
le Job avant sa lecture source si la préparation déployée diffère. Après un changement, redéployer avec `data:prepare`.

Le premier `data:prepare` demande la même plage explicite. Charger les autres plages avec `data:replay`. Garder le
schedule en pause jusqu'à la réconciliation de toute la couverture. Le starter ne conserve pas de checkpoint.

## Premier provisioning

Depuis une révision fusionnée et avec un profil autorisé à créer l'app et à accorder les bindings déclarés :

```bash
npm run app:provision -- --target prod --profile valiuz-analytics-dev
```

La commande affiche d'abord le workspace, la target, l'app, le commit, le warehouse, le projet, le schema et le nombre
de sources. Le plan montre aussi les Spaces Genie, `CAN_RUN` et le scope utilisateur `genie`. Elle valide puis crée les
ressources, sans démarrer l'app. Utiliser ensuite la page **Authorization** de
l'app pour identifier son service principal, et lui configurer un credential GitHub en lecture seule. Ne jamais placer
ce credential dans le repository, les variables non secrètes GitHub ou un log.

Examiner la configuration utilisateur après le provisioning. Le scope `genie` demande un consentement utilisateur ou
administrateur. Ne pas ajouter le scope `sql` si seul le service Genie exécute les requêtes.

## Target prod et GitHub Actions

La target `prod` est Git-backed : Databricks Apps récupère le commit exact résolu par le workflow. Configurer l’environment
GitHub `databricks-production`, protéger ses approbateurs si nécessaire, puis définir ces **variables** :

| Variable | Valeur |
| --- | --- |
| `DATABRICKS_HOST` | `https://3070470996474403.3.gcp.databricks.com` par défaut |
| `DATABRICKS_CLIENT_ID` | service principal fédéré autorisé à déployer |
| `DATABRICKS_AUTO_DEPLOY` | `false` initialement ; `true` après validation du workflow manuel |

Le workflow utilise GitHub OIDC (`DATABRICKS_AUTH_TYPE=github-oidc`) : aucun client secret Databricks n’est stocké dans
GitHub. Créer la federation policy Databricks correspondant au repository, à la branche/environment et au service
principal. Le principal CI doit pouvoir gérer les ressources du bundle, sans droits de données inutiles.

La CI construit l'app avec `APP_MODE=databricks`, sans les variables runtime. Le build ne lit aucune configuration runtime.
Le navigateur charge la configuration publique depuis `/api/config` après le démarrage. Databricks injecte le host et les credentials lorsque le serveur démarre.

Le job principal exécute `npm run template:check` puis `npm run template:release:check` face au SHA de base de la pull
request ou du push. Un autre job exécute `npm run template:journey` après ces contrôles. Il crée une copie Git propre et
y exécute `npm ci`. Il initialise ensuite l'app, son état de template, le cadrage, une source directe et une tranche
KPI. Enfin, il exécute `app:doctor` et `npm run check`. Ce job n'utilise aucun workspace ou credential Databricks.

Le parcours prépare aussi les deux tables personnelles avec `user-state:init`. La matrice CLI vérifie leurs bindings
`MODIFY` en complément du binding analytique `SELECT`, toujours contre le serveur local.

Un autre job CI initialise une app temporaire avec un contrat notebook borné. Il valide les bundles app et data pour
les targets `dev` et `prod`. La matrice utilise les versions `0.295.0` et `1.14.1` du Databricks CLI. Un serveur HTTP
local fournit les réponses minimales. Ce job n'utilise ni profil, ni credential réel, ni workspace distant.

Le job `Genie demo journey` teste le contexte, les résultats riches, l’épinglage et la continuation dans Chromium.
Il couvre aussi le refus de permission, le mobile, le thème sombre et le mouvement réduit. Il reste en mode démo.

Le workflow de déploiement installe la version `1.14.1`, qui figure dans cette matrice. Pour mettre le CLI à jour,
modifier la matrice, le test de workflow et la version de déploiement dans la même pull request.

Le workflow vérifie l’identité, valide le bundle, injecte le SHA du checkout dans `git_source.commit`, déploie, lance
la ressource app, puis attend l’état `RUNNING`. Un déclenchement manuel accepte une branche, un tag ou un SHA dans
`git_ref` ; la valeur est résolue et épinglée avant le déploiement.

## Smoke checks et rollback

Après déploiement :

1. appeler `GET /api/health` avec OAuth → `{ "status": "ok" }` ;
2. appeler `GET /api/readiness` : chaque source déclarée doit accepter la requête `SELECT ... WHERE FALSE` sans ligne
   retournée, avec l'identité de l'app ;
3. lancer la vérification de connexion depuis l’UI ;
4. contrôler les logs par `requestId` sans payload sensible ;
5. tester les permissions d’un utilisateur `CAN_USE` et d’un gestionnaire `CAN_MANAGE` ;
6. poser une question Genie avec deux utilisateurs aux droits de données distincts ;
7. vérifier qu’aucun jeton, question, SQL ou résultat ne figure dans les logs.

Le workflow effectue automatiquement les deux premiers contrôles avec `npm run app:smoke`. En local, la même commande
accepte `--profile <profil>` ; le jeton OAuth reste en mémoire et n'est jamais affiché.

Le smoke Genie est manuel, car il exécute une demande réelle et peut démarrer un compute. Obtenir l’autorisation
explicite avant ce test. Vérifier le workspace, l’app, le Space et les deux identités avant l’appel.

Pour revenir en arrière, utiliser le déclenchement manuel avec le SHA d'une révision connue, puis restaurer `main` par
une pull request. Le déploiement reste ainsi associé à un commit immuable. Ne pas modifier manuellement le code source
dans le workspace : cela rendrait l’état différent de Git.

## Activer les analyses personnelles

Suivre [user-state.md](user-state.md) avant d’activer `USER_STATE_ENABLED`. `user-state:init` prépare uniquement les
fichiers locaux. Relire workspace, profil, app, warehouse, namespace et tables ; créer les deux tables avec l’identité
du mainteneur avant de déployer leurs bindings `MODIFY` (incluant `SELECT`). Configurer l’origine HTTPS exacte.

Le plan de déploiement liste les deux tables et leurs droits. Tester deux utilisateurs réels et la persistance après
redémarrage ; le readiness analytique ne vérifie pas les écritures personnelles. Le rollback utilise le flag désactivé
et conserve les tables. Aucun job de purge ou déploiement automatique n’est ajouté.

## Runtime AppKit 2.0

Le build produit `dist/client` et `dist/server/index.js`. `npm run start` démarre AppKit avec les credentials injectés.
Le port provient de `DATABRICKS_APP_PORT`. Le bundle et la source Git de production restent inchangés.
Dans le repository source, la CI valide aussi les fixtures consommateur et migration 1.5 vers 2.0.
Ces fixtures du template ne sont pas rejouées dans une application initialisée.
Consulter [la migration](migration-2.0.md) avant le premier déploiement d’une app existante.
La surveillance amont hebdomadaire reste en lecture seule. Aucun workflow de fusion automatique n’est ajouté.
