# Développement local avec Databricks

Ce runbook sépare le développement sans accès distant, la lecture de vraies données avec l'identité du développeur et
le runtime Databricks Apps avec l'identité propre de l'application.

## Choisir le mode

| Mode | Commande | Identité | Accès distant |
| --- | --- | --- | --- |
| Démo | `npm run dev` avec `APP_MODE=demo` | aucune | aucun |
| Données réelles locales | `npm run dev` avec `APP_MODE=databricks` | profil OAuth U2M du développeur | lecture autorisée |
| Databricks Apps | bundle et déploiement | service principal de l'app | ressources liées et grants UC |
| CI de production | workflow GitHub | principal OIDC de déploiement | gestion du bundle uniquement |

Les droits du développeur ne prouvent pas ceux du service principal de l'app, et inversement. Valider les deux identités
avant la mise en production.

Avant de chercher une erreur manuellement, lancer :

```bash
npm run app:doctor
```

La commande reste locale, ne révèle aucune valeur de credential et indique la prochaine action. Ajouter `--remote`
uniquement pour lancer le préflight Databricks en lecture seule.

## 1. Installer le CLI

Le bundle exige Databricks CLI `0.295.0` ou plus récent :

```bash
databricks version
```

Sur macOS, l'installation recommandée est :

```bash
brew install databricks/tap/databricks
```

Pour Linux ou Windows, suivre la
[documentation d'installation Databricks](https://docs.databricks.com/gcp/en/dev-tools/cli/install).

## 2. Déclarer le projet et les sources

Le projet de données correspond au catalogue Unity Catalog. Choisir exactement une valeur parmi
`dev-dtm-operating`, `dev-dtm-media-pm`, `dev-dtm-myvaliuz` et `dev-dtm-insight-sharing`. `npm run init-app` reporte ce
choix dans `app.yaml`, `.env.example` et `config/data-access.json`.

Le parcours recommandé enregistre la source, son propriétaire, son grain et sa fraîcheur :

```bash
npm run data:init -- campaign-performance
```

Choisir `direct` dans la majorité des cas. Le script ajoute alors la table ou vue au manifeste. Le résultat reste le
même format simple et relisible :

```json
{
  "project": "dev-dtm-media-pm",
  "sources": [
    {
      "name": "campaign-performance",
      "fullName": "dev-dtm-media-pm.analytics.campaign_performance",
      "purpose": "KPI du cockpit campagne"
    }
  ]
}
```

Générer et contrôler les bindings Databricks :

```bash
npm run data:access:render
npm run data:access:check
```

Le manifeste et `resources/data-access.generated.yml` doivent être revus et commités ensemble. Une source appartenant
à un autre projet est refusée.

Si l'app a réellement besoin d'une table préparée, choisir `notebook` ou `pipeline`. Relire les colonnes et le SQL
générés sous `data/`, puis afficher la cible sans écrire :

```bash
npm run data:prepare -- campaign-performance --profile valiuz-analytics-dev
```

La commande demande `--confirm` avant de déployer le mini-bundle et d'exécuter le SQL d'écriture. La table de sortie est
créée avec l'identité du développeur ; l'app ne recevra ensuite que `SELECT`.

Si le contrat déclare `bounded-replace`, afficher une reprise avant de l'exécuter :

```bash
npm run data:replay -- campaign-performance \
  --profile valiuz-analytics-dev \
  --start-date 2026-08-01 \
  --end-date 2026-08-07
```

La commande affiche la plage, sa limite, le jour finalisé, la couverture requise et le warehouse. Ajouter `--confirm`
pour démarrer le Job déployé. La commande ne redéploie pas le mini-bundle. Les deux dates sont obligatoires. Un
fingerprint du contrat et du SQL refuse un Job déployé depuis une autre révision avant sa lecture source.

Avant le premier run, vérifier le type `DATE` et le pruning physique de la source. Adapter aussi les contrôles de
complétude du staging au contrat métier.

## 3. Préparer la configuration locale

Copier le modèle, puis renseigner uniquement des valeurs non secrètes :

```bash
cp .env.example .env.local
```

Vérifier dans `.env.local` :

```dotenv
APP_MODE=databricks
APP_SUPPORT_NAME="Prénom ou équipe"
APP_SUPPORT_SLACK_URL="https://valiuz.slack.com/team/<identifiant>"
GENIE_MAX_CONCURRENT_STREAMS=8
GENIE_MAX_CONCURRENT_STREAMS_PER_USER=2
DATABRICKS_HOST=https://<workspace-url>
DATABRICKS_CONFIG_PROFILE=valiuz-analytics-dev
DATABRICKS_SQL_WAREHOUSE_ID=<warehouse-id>
DATABRICKS_GENIE_SPACE_ID_FRAIM_SALES=<space-id>
DATABRICKS_CATALOG=<projet-autorisé>
DATABRICKS_SCHEMA=<schema>
DATABRICKS_TOKEN=
```

`.env.local` est ignoré par Git. Le nom du profil n'est pas secret. Ne jamais copier un jeton OAuth du CLI dans ce
fichier, un ticket, un message ou un prompt.

`DATABRICKS_CATALOG` doit être identique au champ `project` du manifeste.
Le Space ID doit correspondre à l’entrée `fraim-sales` de `config/genie-spaces.json`.
Si la source est une URL MCP, utiliser uniquement son dernier segment hexadécimal de 32 caractères.

## 4. Se connecter avec OAuth U2M

Créer le profil avec le workspace exact indiqué dans `.env.local` :

```bash
databricks auth login \
  --host https://<workspace-url> \
  --profile valiuz-analytics-dev
```

Le navigateur ouvre la connexion Valiuz. Le CLI conserve et rafraîchit le jeton OAuth dans son stockage utilisateur.
Consulter la [documentation OAuth U2M](https://docs.databricks.com/gcp/en/dev-tools/cli/authentication) en cas de
problème d'authentification.

La route Genie utilise ce jeton OAuth pour le développement local. Ce comportement représente uniquement le
développeur connecté. Le runtime déployé utilise `x-forwarded-access-token` pour chaque utilisateur.

Le mode démo ne lit pas ce Space ID et ne demande aucun jeton. La page `/genie` utilise alors une conversation
synthétique. Elle permet de développer les états, les résultats riches et l’épinglage sans accès distant.

## 5. Vérifier les accès sans SQL

```bash
npm run databricks:check
```

Le préflight échoue explicitement si :

- le CLI est absent ou trop ancien ;
- le profil cible un autre workspace ;
- l'identité n'est pas authentifiée ;
- le warehouse n'est pas visible ;
- `USE CATALOG` ou `USE SCHEMA` manque sur le périmètre configuré ;
- une table ou vue déclarée n'est pas visible dans les métadonnées.

Il lit uniquement des métadonnées et n'exécute aucune requête SQL. Il affiche l'identité et les cibles vérifiées, jamais
le jeton.

## 6. Tester le chemin SQL réel

Après confirmation du workspace, du warehouse, du projet/catalogue et du schema :

```bash
npm run test:databricks
```

Cette commande exécute `SELECT current_user()` puis compile les sources déclarées avec `SELECT ... WHERE FALSE`. Chaque
segment d'identifiant est validé et délimité avant le binding. Aucune ligne métier n'est retournée. La commande peut
démarrer le warehouse et générer un coût. Le driver demande au CLI un jeton OAuth éphémère et ne le journalise pas.

Pour développer ensuite sur les vraies sources :

```bash
npm run dev
```

Ouvrir <http://localhost:3000> et lancer la vérification de connexion. Les requêtes métier restent en lecture seule,
paramétrées et bornées. L'accès à une table demande aussi `SELECT` pour l'identité du développeur.

Pour une preview accompagnée de bout en bout, commencer par afficher le plan :

```bash
npm run preview:real -- --profile valiuz-analytics-dev
```

Après vérification des cibles, ajouter `--confirm`. Ajouter `--prepare-data` uniquement si les starters notebook ou
pipeline doivent être exécutés dans la même opération. La preview est volontairement limitée à la target `dev`, puis
enchaîne le préflight distant, le déploiement de l'app et les smokes `/api/health` et `/api/readiness`, puis affiche
l'URL validée.

La preview refuse `--prepare-data` si un contrat utilise `bounded-replace`. Exécuter ce contrat séparément avec ses
deux dates explicites.

## 7. Valider ou déployer un bundle dev

Les commandes suivantes utilisent explicitement le même profil :

```bash
npm run bundle:summary -- --target dev --profile valiuz-analytics-dev
npm run bundle:validate -- --target dev --profile valiuz-analytics-dev
npm run deploy -- --target dev --profile valiuz-analytics-dev
```

`bundle:summary` et `bundle:validate` sont des contrôles. `npm run deploy` téléverse le checkout, modifie des ressources
distantes, attribue les accès `SELECT` déclarés et démarre l'app : confirmer les cibles et obtenir l'autorisation
requise avant de l'exécuter.

## Fallback PAT

Un PAT court terme reste accepté uniquement lorsque OAuth U2M n'est pas disponible. Dans ce cas, laisser
`DATABRICKS_CONFIG_PROFILE` vide et définir `DATABRICKS_TOKEN` seulement dans `.env.local`. Ne jamais renseigner les deux
méthodes en même temps. Revenir au profil OAuth dès que possible.

## Dépannage

- Profil expiré ou révoqué : relancer `databricks auth login` avec le même host et le même profil.
- Mauvais workspace : corriger le profil ou `DATABRICKS_HOST`, sans contourner le contrôle de cohérence.
- Warehouse inaccessible : demander `CAN_USE` sur le warehouse, sans élargir les droits Unity Catalog.
- Catalog ou schema inaccessible : faire vérifier `USE CATALOG` et `USE SCHEMA` par le propriétaire des données.
- Table inaccessible : demander uniquement `SELECT` sur les objets nécessaires.
- `SQL_QUERY_FAILED` : utiliser le `requestId` dans les logs structurés ; ne pas activer de log contenant le SQL complet,
  les paramètres ou le jeton.

## Démo des analyses personnelles

La commande et le parcours sont décrits dans [user-state.md](user-state.md#essayer-localement). Utiliser une origine
loopback explicite et un port libre. Le mode mémoire perd son contenu au redémarrage. Le mode SQL personnel exige
le proxy Databricks Apps ; ajouter soi-même un header en local ne constitue pas une identité autorisée.
