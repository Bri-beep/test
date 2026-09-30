---
name: create-analytics-dbx-app
description: Orchestrer la création, la reprise ou la migration demandée d'une application Valiuz issue du template Databricks Apps. Lire l'état du projet, sélectionner les capacités AppKit et les skills utiles, puis conduire l'implémentation et les tests.
---

# Mission

Piloter en français la création ou la reprise d'une app jusqu'au résultat demandé et vérifié.
Le besoin peut être un KPI, une conversation, un fichier, un formulaire ou un traitement.
Conserver dans le template les décisions Valiuz et consulter les instructions Databricks officielles pour les APIs.
L'agent de développement qui lit ce skill porte l'orchestration. Aucun agent runtime ni service supplémentaire n'est nécessaire.
Par défaut, une seule personne porte analyse, métriques, préparation et app. Elle exprime le besoin ; l'agent choisit
les commandes et les skills au moment utile. Ne pas lui demander de choisir entre DA, AE et DE.

# Boucle de travail

1. Lire les instructions et inspecter le checkout comme indiqué au démarrage.
2. Dans un clone équipé, lancer `npm run app:orchestrate -- --json`.
   Ajouter `--skills-dir <dossier externe>` si l'emplacement des skills est connu.
3. Pour une création analytics, lire [le parcours complet](references/analytics-workflow.md), puis la référence
   de l'étape proposée et les éventuelles notes `docs/creation-progress.md`.
   Confronter ces notes au code, au diff et à la demande actuelle avant de reprendre.
4. Charger les skills utiles à cette étape. Installer les manquants lorsque la mise en place locale est autorisée.
   Suivre [references/orchestration.md](references/orchestration.md) pour l'installation, les preuves et la reprise.
5. Exécuter la prochaine action dans le périmètre demandé. Poursuivre les étapes locales autorisées sans demander un accord à chaque transition.
6. Après un changement significatif, relire le diagnostic et mettre à jour les notes de reprise.
   Terminer lorsque les critères demandés sont vérifiés ou qu'une information indispensable manque.

Le diagnostic est un point de départ. Une feature existante ou une capacité non SQL demande une lecture du code.
`verification` signifie que les fichiers permettent de commencer la vérification, jamais que les tests ont réussi.
Une demande d'évolution reprend la feature concernée même si la première tranche du projet existe déjà.
En l'absence de la commande dans une ancienne app, utiliser `app:doctor` et les fichiers disponibles sans imposer une migration.
Pour une migration explicitement demandée, suivre le parcours ci-dessous avant les générateurs.

# Choisir le parcours

- Pour démarrer depuis le terminal, lire [le parcours CLI](../../../docs/cli-workflow.md).
  `npm run app` donne l'aide ; `app next` est l'alias de `app:orchestrate`.
  `app prompt --idea <besoin>` couvre tout le parcours. L'option historique `--role` accentue une priorité,
  sans retirer les autres étapes ni changer les droits ou ressources.
- Pour migrer volontairement une app 1.4 ou 1.5, lire [le guide de migration](../../../docs/migration-2.0.md).
  Utiliser `app migrate --app-dir <app>` depuis un checkout cible relu et installé, distinct de l'app.
  Comparer la version déclarée au code ; le bilan ne certifie pas la compatibilité. Préserver la révision de rollback.
  Appliquer les contrats 1.4 → 1.5 avant 2.0 si nécessaire ; garder l'état personnel désactivé lorsqu'il est inutile.
  Ne pas lancer `init-app` sur l'ancienne app. Porter et tester ses adaptations avant de déclarer sa nouvelle version.
- Pour choisir les capacités AppKit et consulter les bons skills amont, lire
  [references/appkit-capabilities.md](references/appkit-capabilities.md). Le faire pendant le cadrage, puis lors d'un nouveau besoin.
- Pour ajouter Genie ou explorer un écart depuis un dashboard, lire [le parcours Genie](references/genie.md).
  Il couvre sources, Space, définitions, intégration AppKit, questions de référence et recette avec les droits réels.
- Pour diffuser une comparaison avec son contexte, lire [le partage facultatif](references/sharing.md).
  L'activer seulement pour un besoin de diffusion, après revue des filtres partageables.
- Pour créer le repository Valiuz, attribuer l'équipe, préparer le dossier local et initialiser le template, lire
  [references/bootstrap.md](references/bootstrap.md).
- Pour cadrer le besoin, les KPI, les sources et les requêtes, lire
  [references/product-discovery.md](references/product-discovery.md).
- Pour explorer des objets Unity Catalog et établir leur contrat sans exposer de lignes sensibles, lire
  [references/data-discovery.md](references/data-discovery.md).
- Pour choisir entre lecture directe, notebook batch et pipeline Lakeflow, lire
  [references/data-preparation.md](references/data-preparation.md).
- Pour conserver un historique ou rejouer une plage avec un coût borné, utiliser le skill
  `design-cost-aware-data-history`.
- Pour implémenter une tranche fonctionnelle ou poursuivre une application initialisée, lire
  [references/delivery.md](references/delivery.md).

Pour un nouveau projet, identifier d'abord l'utilisateur, son action et son critère de succès.
Initialiser ensuite une démo locale, choisir les capacités utiles, puis traiter les accès nécessaires à la première tranche.
Un projet existant commence à la première étape manquante. Ne pas rejouer `init-app` ni `databricks apps init` sur un clone initialisé.
Une demande explicite d'app Valiuz conserve ce choix. Pour un simple besoin de reporting encore ouvert, comparer brièvement
l'app avec un dashboard géré avant de créer un repository.

# Démarrage obligatoire

1. Lire `AGENTS.md`, `README.md`, puis les runbooks pertinents sous `docs/` s'ils existent.
2. Inspecter `git status --short --branch` et les remotes avant toute modification.
3. Déterminer si l'on se trouve dans le template, dans une application initialisée ou hors repository.
4. Préserver tout travail existant qui ne fait pas partie de la demande.

# Conduire l'échange

- Poser une à trois questions courtes à la fois. Ne jamais envoyer tout le questionnaire en une seule fois.
- Ne pas redemander une information déjà disponible dans les fichiers, GitHub ou les réponses précédentes.
- Pour une décision technique difficile, proposer une option recommandée et expliquer brièvement son impact.
- Présenter les capacités en termes d'usage. Proposer une combinaison minimale et différer celles sans besoin confirmé.
- Ne pas imposer un premier KPI à une app Genie ou fichiers. `feature:new` couvre les KPI count/sum/avg.
  Proposer `--date-column` seulement pour une comparaison utile ; `--breakdown-column` ajoute les contributions additives.
  Suivre `docs/period-comparison.md` et valider le calendrier, la complétude et le grain avant un waterfall.
- Donner des nouvelles aux étapes utiles, puis poursuivre le travail autorisé. Une proposition de commande ne termine pas une demande d'implémentation.
- Une fois le clone disponible, maintenir `config/app-spec.yml` comme source de vérité courte avec `app:guide`.
  `docs/product-brief.md` est sa projection générée ; marquer `À confirmer` au lieu d'inventer une réponse.
- Ne jamais inscrire de secret, token, donnée client, identifiant personnel ou extrait sensible dans le brief, les
  prompts, les logs, les fixtures ou Git.

# Contraintes non négociables

- L'organisation GitHub est `valiuz`.
- Le nom du repository respecte `^analytics_dbx_app_[a-z0-9][a-z0-9_-]*$`.
- Le repository provient de `valiuz/analytics_dbx_app_template`.
- L'équipe Analytics doit avoir un accès explicite au repository. Résoudre son slug réel et faire confirmer le niveau
  d'accès.
- Le clone local vit dans un dossier explicite portant le nom du repository, jamais à l'intérieur d'un autre checkout
  Git.
- Le projet de données est un catalogue Unity Catalog choisi dans `config/data-projects.json`. Les valeurs initiales
  autorisées sont `dev-dtm-operating`, `dev-dtm-media-pm`, `dev-dtm-myvaliuz` et `dev-dtm-insight-sharing`.
- Chaque table ou vue consommée est déclarée dans `config/data-access.json` et appartient au projet sélectionné.
- Une app interne mono-mainteneur reste en mode `direct` tant qu'une table ou vue existante suffit. Ne créer un Job ou
  une pipeline que pour une préparation explicitement requise ; l'app garde uniquement `SELECT` sur la sortie.
- Les skills locaux restent au format ouvert `.agents/skills`. Installer les skills amont hors du code de l'app avec le CLI officiel.
  Consigner leurs noms et révisions ; conserver les adaptations Valiuz dans les références locales, sans modifier les fichiers amont.
- Ne pas interpoler d'entrée utilisateur dans le SQL. Paramétrer les requêtes, borner leur durée et leur volume, puis
  valider les lignes avec Zod.
- Vérifier qu'une autorisation explicite couvre toute mutation distante. Cela comprend la création du repository,
  l'ajout de l'équipe, un push, une pull request, un changement de paramètres GitHub, un grant, un SQL d'écriture ou un
  déploiement Databricks. Réutiliser un accord déjà donné pour les mêmes cibles et le même périmètre.
- Avant une mutation distante, afficher l'hôte, l'organisation ou workspace, le repository ou app, la branche, le
  warehouse, le projet/catalogue et le schema qui s'appliquent. N'afficher que les champs pertinents à l'opération.
- En cas de réussite partielle, s'arrêter, décrire exactement l'état créé et proposer une reprise. Ne jamais supprimer
  automatiquement un repository ou une ressource distante pour compenser un échec.

# Résultat attendu

Terminer la demande avec : l'état obtenu, les décisions enregistrées, les commandes réellement exécutées,
les validations réussies ou non exécutées, et les éventuels points restants. Ne jamais annoncer une vérification
qui n'a pas été exécutée.

# Runtime AppKit 2.0

`npm run app:capabilities` expose les choix de la spec, les ressources, les guides et les tests à prévoir.
`npm run app:skills` propose les skills amont du socle et ceux utiles aux capacités retenues.
Ces commandes sont locales et en lecture seule. Aucun choix dans le brief n'active un plugin ou une ressource.

Avant une intégration, lire la page correspondante dans les docs du package installé avec `npx --no-install appkit docs`.
Lire les exceptions de `docs/appkit-maintenance.md`. Les contrats Valiuz priment sur les exemples génériques de scaffolding.
Une migration de runtime demande les parcours consommateur et E2E ; les fixtures 1.4 et 1.5 s'exécutent dans le repository source.
