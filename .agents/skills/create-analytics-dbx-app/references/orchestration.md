# Piloter et reprendre une création

Lire ce guide pour exécuter le parcours, installer une guidance manquante ou reprendre une session interrompue.
Les commandes de diagnostic proposent des actions. L'agent les examine et réalise le travail demandé.

## État du projet

`app:orchestrate` assemble les contrôles de `app:doctor`, la spec, les fichiers des features et les skills nécessaires.
Il reste local et en lecture seule. `--json` expose les diagnostics, la référence à lire et les installations proposées.
Il ne lit aucun profil Databricks et ne lance ni installation, ni test, ni appel au workspace.
L'entrée courte `npm run app -- next` délègue au même diagnostic. `app prompt --idea <besoin>` produit un texte
de démarrage à copier, sans lancer d'agent. Une seule personne peut suivre tout le parcours.
Pour une migration demandée, lire `docs/migration-2.0.md` et utiliser le bilan depuis le checkout cible avant cette boucle.

| Phase | Action de l'agent |
| --- | --- |
| `bootstrap` | Initialiser une nouvelle copie isolée ; conserver le repository source du template |
| `framing` | Compléter utilisateurs, action, succès et capacités depuis la demande, puis poser les seules questions manquantes |
| `data` | Définir la source de la tranche et son contrat ; différer le distant pour une démo |
| `implementation` | Générer ou construire la tranche demandée et relire son calcul |
| `integration` | Examiner l'intégration non SQL et réaliser ce qui manque à son critère d'acceptation |
| `repair` | Corriger les fichiers ou déclarations incohérents ; conserver les adaptations existantes |
| `verification` | Exécuter les contrôles et tester le parcours utilisateur demandé |

Le plan ne prouve pas l'enregistrement des routes, la correction du calcul ou l'activation d'un plugin.
Les intégrations non SQL restent `review-required` jusqu'à leur revue par l'agent.
Une phase inchangée peut être normale après un test. Comparer les preuves au critère demandé au lieu de boucler sur la commande.
Après un échec identique sans nouvelle information, diagnostiquer sa cause avant de retenter.
Si une information bloque une capacité, poursuivre les actions indépendantes utiles.

Le champ `workflow` rend visibles les sept étapes du [parcours complet](analytics-workflow.md), même quand la prochaine
commande concerne le code. `declared` décrit une déclaration, `needs-input` une information absente,
`review-required` une revue à conduire, `not-applicable` une étape sans objet pour les capacités retenues.
`not-run` signifie que ce bilan n'exécute pas la vérification. Il reste ainsi après un test lancé par ailleurs.
`workflow.data` expose les contrats locaux lisibles et leurs valeurs déclarées ; une erreur de lecture produit
`unavailable` et les diagnostics restent à corriger. Ni un contrat, ni une fréquence déclarée, ni une note
« validé » ne prouvent la qualité des données réelles.

Utiliser les `localSkills` aussi au début de la tranche : la revue des KPI intervient dès les sources et la conception.
Le choix `direct` est normal ; le champ préparation n'oblige pas à créer une ressource.

## Préparer les skills au moment utile

1. Résoudre le dossier externe depuis les outils ou la configuration de l'assistant. Ne pas deviner qu'une installation existe.
2. Relancer `app:orchestrate --json --skills-dir <dossier>` avec ce chemin.
3. Lire les entrées `upstream.needed` pertinentes. Lire seulement leurs références nécessaires à l'étape.
4. Pour les entrées `missing`, examiner `databricks aitools install --help` et le champ `missingInstall`.
5. Si la mise en place locale entre dans la demande, exécuter l'installation ciblée hors du code de l'app.
   Ajouter `--agents <assistant>` selon le CLI installé pour cibler le bon outil.
6. Relancer le diagnostic après installation. Charger le skill depuis son fichier si le catalogue n'est pas encore actualisé.

`unchecked` demande de résoudre le dossier. `invalid`, `changed` et `unreviewed` demandent une lecture des écarts.
Ne pas écraser ces entrées ni modifier les empreintes du template pour faire passer le contrôle.
Une empreinte conforme porte uniquement sur `SKILL.md`, pas sur ses références ou son chargement par l'assistant.
Si le CLI manque ou si l'installation échoue, continuer avec les documents du package installé et signaler cette limite.
Une mise à jour AppKit ou une adoption bêta reste une décision distincte du besoin d'un skill.

Appliquer les adaptations de [appkit-capabilities.md](appkit-capabilities.md) aux exemples amont.
Les règles Valiuz et les choix utilisateur connus évitent de refaire le scaffold ou de demander une décision déjà prise.
Consulter les docs du package installé pour les signatures d'API.

## Garder une reprise utile

Créer ou mettre à jour `docs/creation-progress.md` dans l'application après une étape significative.
Conserver les notes existantes. Ce document contient seulement :

- L'objectif courant et les critères d'acceptation.
- Le niveau de résultat demandé : démo, données réelles ou mise en service.
- Les décisions, hypothèses et limites de la démo.
- Les fichiers ou routes réalisés et ce qui reste à faire.
- Les commandes exécutées, leur résultat et la révision testée, avec les modifications locales encore présentes.
- Les preuves de calcul et de qualité, leurs limites et les contrôles distants non exécutés.
- La prochaine action et les informations réellement bloquantes.

La spec et ses déclarations restent les sources de vérité. Ne pas dupliquer leur contenu dans les notes.
Une note n'accorde aucune permission et ne prouve aucun résultat. Vérifier les autorisations dans la conversation actuelle.
Après modification des fichiers concernés, les anciens tests ne prouvent plus leur état courant.
Ne jamais y stocker de credential, ligne client ou identifiant personnel.

## Essai local sur une mini-app

Utiliser une copie isolée, avec un nom d'app, une source fictive explicitement documentée et un KPI synthétique.
Ne pas lancer d'exploration réelle pour obtenir une valeur de démo.
Le générateur demande un contrat de source : la déclaration fictive ne prouve pas l'existence d'une table.
Conserver `APP_MODE=demo` pour cet essai. Avant un usage réel, remplacer la source et vérifier son contrat et ses accès.

Vérifier la reprise après le cadrage, puis après génération, sans rejouer `init-app` ou `feature:new`.
Exécuter les contrôles locaux et ouvrir la route générée dans le navigateur.
Vérifier la navigation, la valeur synthétique, le chargement, l'absence de données et l'erreur utile.
Enregistrer les commandes et observations dans les notes de cette copie.
Ne créer aucun repository distant, grant, ressource, préparation ou déploiement pour cet essai.
