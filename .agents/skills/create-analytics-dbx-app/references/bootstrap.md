# Création GitHub et initialisation locale

Utiliser ce parcours quand le repository cible n'existe pas encore ou quand un clone issu du template n'a pas encore
été initialisé.

Identifier d'abord l'action utilisateur et le critère de succès avec `product-discovery.md`.
Les valeurs locales du template permettent une démo sans credentials. Différer les questions workspace, warehouse,
schema et groupes jusqu'au premier accès réel, sauf si l'utilisateur les a déjà fournis.
Les valeurs présentes dans les fichiers restent des valeurs à confirmer avant toute opération distante.

Pour un essai local explicitement demandé, partir d'une copie isolée du checkout choisi.
Le parcours GitHub, ses questions d'équipe et ses permissions ne s'appliquent pas à cette copie de test.
Initialiser la copie une fois, puis suivre [orchestration.md](orchestration.md) pour la démo et sa reprise.
Une app déjà initialisée reprend directement son diagnostic, sans recréer de repository.

## 1. Recueillir le strict nécessaire

Procéder par lots de trois questions maximum.

Premier lot :

1. Quel suffixe métier complète `analytics_dbx_app_` et quelle courte description donner au projet ?
2. Le repository doit-il être privé ou interne ? Recommander privé en l'absence de politique connue.
3. Dans quel dossier parent absolu créer le clone local ? Proposer le parent du checkout du template lorsqu'il est
   adapté.

Deuxième lot :

1. Quel niveau d'accès donner à l'équipe Analytics : `pull`, `triage`, `push`, `maintain`, `admin` ou rôle personnalisé ?
   Recommander `push` pour contribuer sans administrer le repository, sauf politique Valiuz contraire.
2. Confirmer le nom applicatif dérivé du repository. `init-app` convertit notamment les underscores en tirets.
3. Si des données réelles sont nécessaires maintenant, choisir le projet autorisé, le schema et les groupes Databricks.
   Sinon, garder ces décisions ouvertes pour le parcours d'accès réel.

Troisième lot :

1. Quel nom de mainteneur ou d'équipe afficher dans l'app ?
2. Quel lien de profil ou de canal Slack Valiuz utiliser pour les questions, bugs et évolutions ?
3. Si un accès réel est prévu, confirmer le workspace et le warehouse ; sinon passer à la démo locale.

Utiliser les valeurs de workspace et warehouse documentées dans le `README.md` comme recommandations, jamais comme
faits implicites. Faire confirmer tout remplacement. Le nom complet du repository doit respecter l'expression imposée
par le skill et ne doit pas déjà exister localement ou sur GitHub.

## 2. Faire les prévérifications en lecture seule

Vérifier au minimum :

- `gh --version`, `gh auth status` et le hostname authentifié ;
- `databricks version` et la compatibilité avec `databricks_cli_version` lorsque l'accès aux vraies données est prévu ;
- que l'utilisateur authentifié peut voir l'organisation `valiuz` ;
- que `valiuz/analytics_dbx_app_template` existe et que `isTemplate` vaut `true` ;
- que le repository cible n'existe pas déjà ;
- que le dossier cible n'existe pas, ou qu'il est vide et explicitement accepté ;
- que le dossier parent n'est pas à l'intérieur d'un checkout Git ;
- le slug exact de l'équipe dont le nom ou le slug correspond à Analytics ;
- la version de Node attendue par `.nvmrc` et `package.json`.

Commandes indicatives à adapter sans exposer de credential :

```bash
gh auth status
gh repo view valiuz/analytics_dbx_app_template --json isTemplate,nameWithOwner,visibility,url
gh repo view "valiuz/${app_repo_name}" --json nameWithOwner,url
gh api orgs/valiuz/teams --paginate --jq '.[] | select((.name | ascii_downcase) == "analytics" or .slug == "analytics") | {name,slug}'
git -C "${local_parent_dir}" rev-parse --show-toplevel
```

L'échec attendu de la recherche du repository cible signifie qu'il est disponible ; distinguer ce cas d'un problème
d'authentification ou de réseau. S'il existe plusieurs équipes candidates, demander laquelle utiliser. Ne jamais deviner
un slug.

## 3. Faire confirmer la mutation

Afficher un récapitulatif compact avant d'agir :

```text
Hôte GitHub : github.com
Organisation : valiuz
Template : valiuz/analytics_dbx_app_template, branche par défaut uniquement
Nouveau repository : valiuz/<nom>
Visibilité : <private|internal>
Équipe : <nom et slug>
Permission : <niveau>
Clone local : <chemin absolu>
Branche locale d'initialisation : chore/bootstrap-<slug-app>
```

Demander un accord explicite couvrant la création du repository et l'attribution de l'équipe. Sans cet accord, fournir
les commandes proposées mais ne pas les exécuter.

## 4. Créer, attribuer et cloner

Après accord, exécuter les opérations une par une et vérifier chaque résultat. Les commandes de référence sont :

```bash
gh repo create "valiuz/${app_repo_name}" --template valiuz/analytics_dbx_app_template --private
gh api --method PUT "orgs/valiuz/teams/${analytics_team_slug}/repos/valiuz/${app_repo_name}" -f "permission=${team_permission}"
gh repo clone "valiuz/${app_repo_name}" "${app_target_dir}"
```

Remplacer `--private` par `--internal` seulement si ce choix a été confirmé. Ne pas inclure toutes les branches du
template. Ne pas réutiliser un dossier non vide. Si la création réussit mais qu'une étape suivante échoue, conserver le
repository et fournir la commande exacte permettant de reprendre.

Vérifier ensuite l'URL, la visibilité, le template d'origine, le remote `origin` du clone et la permission effective de
l'équipe avec `gh repo view`, `git remote -v` et l'endpoint GitHub de l'équipe.

## 5. Initialiser le template une seule fois

Dans le nouveau clone :

1. Inspecter le statut et créer `chore/bootstrap-<slug-app>` depuis la branche par défaut.
2. Exécuter `npm ci`, puis `npm run init-app` une seule fois, de préférence en mode non interactif avec toutes les
   valeurs confirmées.
3. Passer explicitement `--repository-url "https://github.com/valiuz/<nom>"`.
4. Relire `package.json`, `package-lock.json`, `.env.example`, `app.yaml`, `databricks.yml` et le workflow de déploiement.
5. Rechercher les placeholders restants, notamment `__...__`, `replace_me`, `your-org` et `your-repository`.
6. Exécuter `npm run app:guide` pour consigner le public, la décision, le succès attendu et les capacités envisagées.
7. Lire `npm run app:capabilities` et `npm run app:skills`. Suivre `appkit-capabilities.md` pour installer les skills utiles hors du clone.
8. Lancer la démo puis les validations demandées par `AGENTS.md`. Un accès Databricks ne conditionne pas ce premier résultat.

Exemple complet lorsque les cibles réelles ont déjà été confirmées.
Pour une démo seule, omettre les options de cibles distantes ; les valeurs locales du template ne valent pas validation de ces cibles :

```bash
npm run init-app -- "${app_repo_name}" \
  --description "${app_description}" \
  --support-name "${support_name}" \
  --support-slack-url "${support_slack_url}" \
  --warehouse "${warehouse_id}" \
  --data-project "${data_project}" \
  --schema "${schema_name}" \
  --host "${workspace_url}" \
  --can-use-group "${can_use_group}" \
  --can-manage-group "${can_manage_group}" \
  --repository-url "https://github.com/valiuz/${app_repo_name}" \
  --non-interactive
```

Ne pas créer `.env.local` sans besoin de connexion locale. Ne jamais y placer un secret fourni dans la conversation.
Ne pas pousser ou ouvrir une pull request sans autorisation explicite couvrant cette publication.

## 6. Préparer l'accès autonome aux données

Lorsque le membre de l'équipe doit utiliser de vraies données, lire `docs/local-development.md` dans le nouveau clone.
Faire confirmer le workspace, le profil local, le warehouse, le projet et le schema. Pour chaque table ou vue retenue,
lancer le parcours guidé :

```bash
npm run data:init -- <nom-court>
npm run data:prepare:check
```

Conserver le mode `direct` si la source convient. Lire `data-preparation.md` avant de choisir `notebook` ou `pipeline`.
Relire le contrat et les bindings `SELECT` générés avant de les committer. Privilégier ensuite OAuth U2M :

```bash
databricks auth login --host "${workspace_url}" --profile "${databricks_profile}"
npm run databricks:check
npm run test:databricks
```

`databricks:check` lit des métadonnées distantes ; `test:databricks` exécute un SQL en lecture seule et peut démarrer le
warehouse. Demander un accord sur les cibles avant ces appels. Ne jamais demander au membre de copier le jeton produit
par le CLI. Un PAT n'est qu'un fallback local dans `.env.local` et ne doit pas coexister avec le profil.

Si le préflight échoue, indiquer précisément l'accès manquant parmi identité workspace, visibilité warehouse,
`USE CATALOG`, `USE SCHEMA` ou visibilité d'une source. Ne pas proposer automatiquement un grant plus large. Le smoke
SQL valide ensuite `SELECT` sans retourner de ligne sur chaque source déclarée.

## 7. Passer au cadrage produit

Dès que l'initialisation locale est saine, lire `product-discovery.md`. `app:guide` maintient déjà
`docs/product-brief.md` ; compléter les inconnues par petits lots au lieu de recréer le fichier.
