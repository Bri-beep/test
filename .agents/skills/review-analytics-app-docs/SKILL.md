---
name: review-analytics-app-docs
description: Auditer la documentation d'une application analytics Databricks face au code, aux manifests, aux variables et aux workflows réels. Utiliser avant une pull request, après un changement de comportement ou pour rechercher une documentation obsolète.
---

# Mission

Vérifier que `README.md` et `docs/` décrivent fidèlement l'application, son architecture, sa configuration et son
exploitation. Produire un rapport factuel et actionnable. Pour une demande d'audit seule, rester en lecture seule.
Lorsqu'une évolution de code est déjà autorisée et que ce skill termine cette évolution, appliquer les corrections
documentaires minimales qui appartiennent au même périmètre.

# Établir la source de vérité

1. Lire tous les `AGENTS.md` applicables et inspecter `git status --short --branch`.
2. Lire `README.md`, les fichiers sous `docs/`, `package.json`, `.env.example`, `app.yaml`, `databricks.yml` et les
   workflows sous `.github/workflows/` lorsqu'ils existent.
3. Inspecter l'arborescence de `src/client`, `src/server`, `src/shared`, `src/components`, `src/features`, `src/lib`, `scripts` et `tests` sans charger
   les caches ou builds.
4. Pour une review de changement, résoudre la branche de base selon les instructions du repository et lire le diff
   complet relatif à cette base. Ne pas supposer que la base est toujours `main`.
5. Distinguer les faits observés, les incohérences prouvées et les informations impossibles à vérifier localement.

# Auditer le README

Vérifier :

- que les prérequis, commandes d'installation, de développement et de validation existent réellement ;
- que le quick start respecte le script `init-app`, le mode démo et la gestion des secrets ;
- que la structure annoncée correspond aux dossiers et responsabilités réels ;
- que les endpoints, pages, fonctionnalités et modes documentés existent ;
- que le chemin branche → pull request → CI → déploiement correspond aux workflows et runbooks ;
- qu'aucune commande ne laisse croire qu'une mutation distante est locale ou sans conséquence.

# Auditer architecture et fonctionnalités

Comparer `docs/architecture.md` avec les imports et fichiers réels :

- UI/client → service de feature → repository → `SqlExecutor` ;
- routes API utilisant `withApiRoute` et son enveloppe d'erreur ;
- comportement superficiel de `/health` et séparation des checks distants ;
- absence de vocabulaire métier, tables ou KPI dans les modules génériques de `src/lib` ;
- documentation des nouvelles features, routes, contrats de requêtes et choix opérationnels significatifs.

Signaler une documentation manquante uniquement lorsqu'elle change l'usage, le contrat, la configuration, les droits
ou l'exploitation. Ne pas exiger une page documentaire pour chaque fichier interne.

# Auditer configuration et Databricks

Construire la liste des variables depuis le parseur de configuration serveur, puis la comparer à `.env.example`,
`app.yaml`, `databricks.yml`, au workflow de déploiement et aux tableaux documentaires. Vérifier :

- nom, caractère obligatoire, mode d'utilisation et valeur par défaut ;
- séparation entre PAT local, identité injectée et variables publiques ;
- cohérence host, warehouse ID, catalog, schema, groupes et chemins du bundle ;
- droits minimaux et distinction entre binding warehouse, privilèges Unity Catalog et accès à l'app ;
- cohérence entre targets `dev` / `prod`, source Git, branche et workflow GitHub ;
- présence d'avertissements avant déploiement, grants, SQL d'écriture ou autre mutation distante.

Ne jamais afficher la valeur d'un credential trouvé. Rapporter seulement son emplacement et sa catégorie.

# Auditer le diff

Pour chaque changement de comportement, se demander si un lecteur du README ou d'un runbook agirait différemment.
Rechercher notamment :

- nouvelle route, page, feature, commande ou variable non documentée ;
- renommage ou suppression encore mentionné ;
- changement de source, requête, KPI, timeout, limite de lignes ou groupe d'accès ;
- changement de déploiement, workflow, target ou procédure de smoke test ;
- exemple qui ne compile plus ou commande qui n'existe plus.
- capacité présentée comme active alors que seul son besoin figure dans la spec ;
- skill amont annoncé comme installé sans contrôle d'un dossier externe ;
- plugin proposé sans ressource, identité, test ou guide correspondant à la version du package.

Ne pas conclure que la documentation est à jour uniquement parce qu'aucun fichier Markdown n'a changé.

# Produire le rapport

Classer les observations par impact :

- **Bloquant** : une instruction peut provoquer une mauvaise cible, une exposition de secret, un déploiement incorrect
  ou empêcher l'application de fonctionner.
- **Écart** : un comportement, contrat ou paramètre important manque.
- **Obsolète** : la documentation contredit les fichiers actuels.
- **Non vérifiable** : une affirmation dépend d'un état distant non inspecté.

Pour chaque finding, donner fichier, ligne, preuve observée, impact et correction minimale recommandée. Regrouper les
sections sans finding dans un court résumé plutôt que d'énumérer tous les contrôles réussis.

Terminer par :

1. verdict `PRÊT`, `PRÊT AVEC RÉSERVES` ou `NON PRÊT` ;
2. nombre de findings par niveau ;
3. corrections ordonnées par priorité ;
4. fichiers et états distants non inspectés.

Si l'utilisateur demande aussi les corrections, appliquer uniquement les modifications documentaires approuvées,
puis relancer l'audit ciblé et `git diff --check`.
