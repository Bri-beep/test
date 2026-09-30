# Databricks

## Identités

Le développement local réel utilise en priorité un profil OAuth U2M créé par `databricks auth login`. Avec
`DATABRICKS_CONFIG_PROFILE`, le driver SQL demande au CLI un jeton éphémère via `databricks auth token`. Il ne l'écrit ni
dans `.env.local`, ni dans les logs. Un `DATABRICKS_TOKEN` court terme reste un fallback local ; les deux méthodes ne
peuvent pas être configurées ensemble.

Le runtime Databricks Apps n'utilise ni le profil du développeur ni son jeton. La plateforme injecte
`DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID` et `DATABRICKS_CLIENT_SECRET` pour le service principal de l'app. Ces variables
runtime ne sont pas nécessaires pendant le build Vite. La CI utilise une identité distincte via GitHub OIDC.
Suivre [local-development.md](local-development.md) pour configurer ces parcours.

Une préparation notebook ou pipeline utilise l'identité du mainteneur qui exécute `data:prepare`. Cette identité peut
lire la source et créer ou remplacer la sortie. Ces droits d'écriture ne sont jamais transmis au service principal de
l'app, qui conserve uniquement `CAN_USE` sur le warehouse et `SELECT` sur la sortie déclarée.

Le code ne journalise ni ne renvoie ces variables. N’exposer aucune variable Vite contenant un host privé, un identifiant de ressource ou un credential.
Le contrat public de `/api/config` contient uniquement les valeurs d’affichage validées.

## Identité utilisateur pour Genie

La route Genie utilise l’autorisation utilisateur de Databricks Apps. Databricks transmet l’utilisateur et son jeton
dans `x-forwarded-user` et `x-forwarded-access-token`. Le serveur lit ces en-têtes pour chaque requête. Il ne conserve
pas le jeton après la requête.

Le bundle demande uniquement le scope utilisateur `genie`. Chaque utilisateur donne son consentement lors du premier
accès, sauf si un administrateur donne ce consentement. Les droits du Space et les règles Unity Catalog restent ceux
de l’utilisateur. Les filtres de lignes et les masques de colonnes continuent donc de s’appliquer.

`config/genie-spaces.json` associe un Space à des alias publics. Le navigateur envoie un alias comme `fraim-sales`.
Le serveur résout cet alias vers la variable d’environnement injectée par le binding. Le navigateur ne choisit jamais
un Space ID arbitraire.

Chaque entrée utilise un ID de 32 caractères hexadécimaux minuscules. Ses alias incluent toujours la clé stable de la
ressource. Le générateur et le runtime appliquent les mêmes limites.

La ressource application utilise `CAN_RUN` pour chaque Space déclaré. Ne pas utiliser `CAN_EDIT` ou `CAN_MANAGE` pour
un chat en lecture. Le Space, son warehouse et ses sources doivent aussi autoriser l’utilisateur concerné.

En local, le profil OAuth U2M fournit le jeton du développeur. Ce chemin facilite le développement, mais il ne prouve
pas le transfert OBO du runtime. Tester ce transfert dans une app déployée avec deux utilisateurs aux droits distincts.

Les logs excluent les identifiants utilisateur, les jetons, les questions, le SQL et les lignes retournées. Le
`requestId`, le type d’authentification, le statut terminal et la durée servent au diagnostic. Les journaux d’audit
Databricks conservent la corrélation avec l’utilisateur.

## SQL Warehouse et Unity Catalog

Le générateur déclare le warehouse dans `resources/data-access.generated.yml`, avec `CAN_USE`. `app.yaml` reçoit son ID
par `valueFrom`. Le service principal de l'app utilise aussi `USE CATALOG`, `USE SCHEMA` et `SELECT` sur les objets lus.

Le catalogue est le projet de données de l'application. Le template limite ce choix à :

- `dev-dtm-operating` ;
- `dev-dtm-media-pm` ;
- `dev-dtm-myvaliuz` ;
- `dev-dtm-insight-sharing`.

La liste maintenue se trouve dans `config/data-projects.json`. `npm run init-app` et la configuration serveur refusent
une autre valeur. Les noms contiennent des tirets. Le repository valide chaque segment, ajoute ses backticks, puis lie
l'identifiant à `IDENTIFIER(:source)`. Il ne concatène aucune entrée utilisateur dans le SQL.

Le template préremplit l’infrastructure partagée Valiuz suivante :

| Ressource | Valeur |
| --- | --- |
| Workspace | `https://3070470996474403.3.gcp.databricks.com` |
| SQL Warehouse | `team-da-poc` |
| SQL Warehouse ID | `ab362e9710498a08` |
| Permission du binding | `CAN_USE` |

`npm run init-app` propose ces valeurs par défaut et accepte `--host` ou `--warehouse` pour cibler une autre
infrastructure. Vérifier l’ID dans le workspace avant chaque déploiement : le nom lisible du warehouse est documenté
pour les opérateurs, mais le bundle utilise son ID stable.

Déclarer chaque table ou vue consommée dans `config/data-access.json`, avec un nom technique court, son identifiant
`projet.schema.objet` et sa finalité. `npm run data:access:render` génère un binding `uc_securable` `SELECT`. Databricks
accorde alors au service principal de l'app les privilèges minimaux sur l'objet et ses parents. La personne ou
l'identité qui déploie doit être autorisée à accorder ces droits ; ne pas élargir un binding analytique à `MODIFY`. La feature optionnelle [état personnel](user-state.md)
déclare séparément ses deux tables et leurs bindings `MODIFY`, qui incluent `SELECT`.

Le manifeste et `resources/data-access.generated.yml` sont versionnés ensemble. Le fichier généré contient la seule
définition complète de `resources.apps.app`. Les targets de `databricks.yml` ajoutent seulement leur source de code.
La CI exécute `npm run data:access:check` pour détecter une source hors projet, un doublon ou un fichier obsolète.

## Choisir entre direct, notebook et pipeline

Commencer par `direct`. Ajouter une préparation seulement si la requête interactive serait trop complexe ou lente, si
une table doit être partagée dans plusieurs vues de l'app, ou si la fraîcheur doit être pilotée indépendamment du
dashboard.

```bash
npm run data:init -- <nom>
npm run data:prepare:check
```

- `direct` enregistre la table ou vue dans `config/data-access.json` et ne crée aucune ressource.
- `notebook` génère un notebook SQL source-format et un Lakeflow Job utilisant le warehouse configuré.
- `pipeline` génère une materialized view dans une pipeline Lakeflow serverless, orchestrée par un Job.

Les contrats sont versionnés sous `data/contracts/`. Ils définissent la source, la sortie, le grain, les clés, la
fraîcheur, la fréquence et le timeout. Les starters SQL évitent `SELECT *`. Adapter le SQL avant la première écriture.

Un notebook peut utiliser la stratégie `bounded-replace`. Dans ce cas, le contrat ajoute :

- Une colonne déclarée `DATE` et présente dans la clé métier.
- Une fenêtre normale pour le refresh.
- Une fenêtre maximale de 366 jours.
- Un délai qui définit le dernier jour finalisé.
- La profondeur requise et les rétentions source et sortie.

La rétention source est mesurée depuis la date courante. Elle doit couvrir la rétention de sortie et le délai finalisé.
Sinon, utiliser un data product hot/cold. Le générateur ne vérifie pas le type et le pruning physique de la colonne.
Les confirmer dans Databricks avant la première écriture.

Le starter matérialise une table temporaire de session. Il contrôle le type, les clés nulles et le grain. Il publie
ensuite avec `BY NAME` et `REPLACE WHERE`. Le Job applique `max_concurrent_runs: 1` et un timeout non nul. Vérifier que
le SQL Warehouse prend en charge les tables temporaires de session.

Une nouvelle sortie Delta utilise le liquid clustering sur la colonne de date. Pour une sortie existante, vérifier le
provider, le schéma et le layout. Le starter ne modifie pas automatiquement une table existante.

Le mini-bundle `data/databricks.yml` est séparé du bundle applicatif pour respecter cet ordre :

1. relire le contrat et le SQL ;
2. afficher workspace, profil, projet, source et sortie sans mutation ;
3. relancer avec `--confirm` pour déployer et exécuter la préparation ;
4. contrôler la sortie avec `app:doctor -- --remote` ;
5. déployer ensuite l'app et son binding `SELECT`.

```bash
npm run data:prepare -- <nom> --profile valiuz-analytics-dev
npm run data:prepare -- <nom> --profile valiuz-analytics-dev --confirm
```

Pour `bounded-replace`, ajouter `--start-date` et `--end-date` aux deux commandes. La CLI refuse une exécution manuelle
sans ces deux bornes.

Après ce déploiement, exécuter seulement une plage autorisée :

```bash
npm run data:replay -- <nom> \
  --profile valiuz-analytics-dev \
  --start-date 2026-08-01 \
  --end-date 2026-08-07
npm run data:replay -- <nom> \
  --profile valiuz-analytics-dev \
  --start-date 2026-08-01 \
  --end-date 2026-08-07 \
  --confirm
```

La première commande ne modifie rien. La seconde démarre le Job déjà déployé. Elle ne déploie pas le bundle.
Les deux dates sont obligatoires dans la CLI. Le Job planifié utilise sa fenêtre normale et le dernier jour finalisé.
Exécuter `data:replay` depuis la même révision que le dernier `data:prepare`. Le bundle enregistre un fingerprint du
contrat et du SQL dans les paramètres du Job. Le notebook le compare à la valeur locale avant de lire la source. Si le
contrat ou le SQL a changé, la reprise échoue et demande un nouveau `data:prepare`.

Le notebook et les schedules générés utilisent `Europe/Paris`. Confirmer que ce fuseau correspond au calendrier
métier ; sinon, adapter le starter et ses tests avant le premier déploiement.

Le chargement initial utilise des plages contiguës limitées par `maxDays`. La commande n'enregistre pas de checkpoint.
Réconcilier la couverture complète avant de connecter la sortie à l'app.

Utiliser un data product hot/cold si la source expire ou si plusieurs apps utilisent l'historique. Ne pas copier les
notebooks d'un autre projet dans l'app. Conserver l'identité d'écriture dans le data product.

Les schedules `hourly` et `daily` restent `PAUSED`. `--activate-schedule` les passe à `UNPAUSED` lors d'un déploiement
explicitement confirmé ; ce choix s'applique à toutes les préparations planifiées du mini-bundle. Pour une app interne
mono-mainteneur, garder `manual` tant qu'une exécution planifiée n'apporte pas de valeur claire.

## Pattern SQL

- Requêtes dans `src/features/<feature>/server/queries.ts` ou dans un fichier `.sql` voisin si elles sont longues.
- Entrées liées avec un record `parameters: { source, startDate }` et des marqueurs `:source`, `:startDate`; jamais d’interpolation d’entrée utilisateur.
- Identifiants qualifiés validés, délimités segment par segment, puis liés à `IDENTIFIER(:source)`.
- Résultats validés par un schéma Zod dans le repository.
- Nom de requête stable pour les logs et query tags.
- Timeout borné et limite de lignes explicite.
- Fermeture de l’opération, de la session et du client dans tous les cas.

`npm run databricks:check` vérifie en lecture seule le profil, le workspace, le warehouse, le projet, le schema et les
métadonnées des sources déclarées. `npm run test:databricks` exécute ensuite `SELECT current_user()` et compile toutes
les sources dans une requête paramétrée avec `WHERE FALSE`. Ce test d'intégration ne retourne aucune ligne et reste
séparé de `npm test`, afin que la CI unitaire ne dépende pas d'un workspace ou d'un warehouse actif.

`npm run bundle:compatibility` prépare une copie temporaire et un contrat notebook borné. Depuis le template, elle
teste l'initialisation. Depuis une app existante, elle utilise une configuration synthétique dans cette copie,
sans réinitialiser l'app ni modifier son état de version. Le Databricks CLI valide les
bundles app et data pour les targets `dev` et `prod` contre un serveur HTTP local. La commande ne lit aucun profil
Databricks et ne contacte aucun workspace distant.
Ce contrôle porte sur les contrats du bundle avec cette fixture ; il ne prouve pas la configuration ou les droits réels de l'app.

## Secrets additionnels

Si une future app appelle un système tiers, créer un secret Databricks et le référencer par ressource/binding lorsque
la plateforme le permet. Ne placer ni valeur secrète dans `databricks.yml`, ni fallback secret dans le code. Documenter
le propriétaire, la rotation et le privilège minimal requis.
