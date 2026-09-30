# Créer une app depuis le terminal

Après `npm ci`, commencer avec `npm run app`. Ce menu présente le parcours et l'aide disponible.
Les commandes historiques restent compatibles. Le menu délègue aux mêmes scripts, sans nouvelle dépendance.

## Commencer avec un assistant

Copier ce prompt dans l'assistant ouvert sur le projet :

> Utilise create-analytics-dbx-app pour construire une petite app Valiuz de suivi des commandes.
> Je m'occupe du besoin, des données et de l'app. Prends en charge le parcours complet, en commençant par une démo testée.
> Réutilise ce qui est connu, recommande les choix techniques et pose seulement les questions bloquantes.

Pour produire un prompt adapté au besoin :

```bash
npm run app -- prompt --idea "Suivre les commandes par période"
```

La commande affiche du texte à copier. Elle ne lance aucun agent et ne lit aucun credential.
Le parcours couvre les responsabilités DA, AE et DE pour une seule personne, sans choix de profil.
L'option historique `--role data-analyst|analytics-engineer|data-engineer` reste disponible pour approfondir un sujet
dans une itération. Elle conserve les autres étapes ; sa valeur par défaut est `full-cycle`.
`init` refuse une app déjà nommée ou suivie par `.valiuz-template.yml`, avant toute écriture.

L'agent conduit les étapes utiles au résultat demandé :

1. Préciser la décision et une première tranche utile.
2. Identifier les sources et contrôler leur qualité.
3. Définir les KPI et vérifier leurs calculs.
4. Préparer les données seulement si une lecture directe ne suffit pas.
5. Construire l'interface, ses filtres et les états nécessaires.
6. Tester la tranche et les contrôles locaux.
7. Préparer la connexion réelle, la livraison et le suivi ; les actions distantes dépendent du périmètre autorisé.

L'agent remplit les commandes depuis les réponses connues, propose les plugins utiles et consulte les skills adaptés.
Vous précisez les décisions métier manquantes. Il conserve la reprise dans `docs/creation-progress.md` et propose une
seule prochaine action. Voir [les consignes du parcours](../.agents/skills/create-analytics-dbx-app/references/analytics-workflow.md).

Le résultat distingue **démo testée**, **données réelles validées** et **mise en service vérifiée**.
Un faux exécuteur qui retourne 42 ne valide pas le SQL. Un contrat de fraîcheur ne prouve pas la fraîcheur mesurée.
Une demande de démo peut être terminée sans connexion distante ; l'agent indique les preuves encore nécessaires.

## Reprendre sans chercher la bonne commande

```bash
npm run app -- next
npm run app -- next --json
npm run app -- capabilities --all
npm run app -- skills --directory /chemin/vers/les/skills
npm run app -- feature --help
```

`next` examine les fichiers et propose une action. Il ne l'exécute pas et n'affirme pas que les tests passent.
Il affiche aussi les étapes du parcours, les modes data et les grains déclarés. Le JSON inclut `workflow.steps`
et `workflow.data` pour l'agent. Les états « à examiner » restent à confronter aux preuves de session, même après un test.
Pour un JSON utilisable dans un script, employer `npm run --silent app -- next --json`.
`capabilities` expose les intégrations et leurs prérequis. `skills` contrôle uniquement le dossier indiqué, sans installation.
Les déclarations de la spec n'activent ni ressource, ni droit, ni plugin.

## Essayer une première tranche sans Databricks

Utiliser une nouvelle copie du template avec ses dépendances installées. Les tables ci-dessous sont fictives.
Le nom du projet est un exemple de l'allowlist Valiuz, sans preuve d'accès réel.

```bash
npm run app -- init analytics_dbx_app_commandes --data-project dev-dtm-operating --non-interactive
npm run app -- guide --audience "Équipe ventes" --decision "Suivre les commandes" --success "Lire le total de démo" --capabilities analytics --non-interactive
npm run app -- data commandes --mode direct --source dev-dtm-operating.demo_fictive.commandes --purpose "Source fictive de démonstration" --non-interactive
npm run app -- feature total-commandes --source commandes --aggregation count --demo-value 42 --non-interactive
npm run app -- check
npm run app -- dev
```

Ouvrir `http://localhost:3000/total-commandes`. Garder `APP_MODE=demo` pendant cet essai.
Relire le calcul généré. Un zéro est une valeur ; une absence de valeur affiche l'état vide.
Avant les données réelles, remplacer la source fictive et vérifier grain, droits et contrat avec un profil OAuth nommé.
Les commandes `dev` et `check` exécutent respectivement le serveur et les validations de la configuration courante.

Pour Genie, des fichiers ou une autre intégration, commencer par `guide` et `capabilities`.
Les étapes `data` et `feature` ne sont nécessaires que pour une tranche KPI. Le générateur reste limité à `count`, `sum` et `avg`.
Si la comparaison temporelle aide à décider, ajouter `--date-column <colonne_DATE>` à `app feature`.
`--breakdown-column <dimension>` ajoute un filtre commun et un waterfall pour les mesures additives.
`--share-analysis` ajoute le partage facultatif et exige `--date-column`.
`--share-segment` exige aussi `--breakdown-column` et déclare la dimension partageable après revue de ses valeurs.
Le lien restaure des dates fixes et recalcule les données ; la synthèse copie les chiffres consultés avec leurs réserves.
Sans activation explicite, aucune action de partage n'est ajoutée.
Sans ces options, le KPI simple reste inchangé. Voir [les règles et exemples](period-comparison.md).
Le mode `direct` reste le choix par défaut, quel que soit le sujet pris en charge par la personne.
Les préparations locales n'exécutent aucun SQL distant. Leur déploiement et leur exécution suivent le runbook de préparation.

## Préparer une migration 1.4 ou 1.5

Depuis un checkout **2.0 relu**, distinct de l'ancienne app, avec `npm ci` exécuté :

```bash
npm run app -- migrate --app-dir /chemin/vers/ancienne-app
npm run app -- migrate --app-dir /chemin/vers/ancienne-app --json
```

Le bilan lit la version déclarée, inventorie les usages de Next.js et ordonne les guides.
Il ne modifie aucun fichier et n'exécute pas les scripts de l'app inspectée.
Si `.valiuz-template.yml` manque, examiner d'abord l'historique puis préciser `--from 1.4.0` ou `--from 1.5.0`.
Le bilan refuse une version contradictoire ou inconnue. L'ancienne copie du manifeste ne connaît pas les futures releases.

Prompt de migration à adapter :

> Utilise create-analytics-dbx-app pour migrer volontairement cette app vers le template 2.0.
> Le checkout du template cible est à [chemin]. Commence par le bilan de migration et les tests existants.
> Porte les routes et le runtime en préservant les URL, calculs, accès, tables personnelles et personnalisations.
> Vérifie le résultat localement et indique la recette distante restante.

Suivre [le guide 1.4/1.5 vers 2.0](migration-2.0.md). Il décrit le portage manuel et les validations requises.
Un bilan réussi ne constitue ni une migration ni une certification de compatibilité.
