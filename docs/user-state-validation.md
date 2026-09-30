# Validation de la capability personnelle — 21 septembre 2026

Base du template : `26a1d0a64a9fed4d0a9cad1c7031a9d2c07eb95f`.
Source IKEA inspectée : `75338d7cf91a97c07a57b0e0f40ad418dfedd3b6`.
Décision de version : **minor 1.5.0**, nouvelle capability optionnelle `personal-user-state`.

## Contrôles locaux

- Lint, TypeScript et 125 tests unitaires du template : succès.
- Build de production avec `APP_MODE=databricks`, sans credentials runtime : succès.
- Parcours consommateur propre : initialisation, source, KPI, préparation des tables personnelles, 127 tests et build : succès.
- Bundle app/data, targets dev/prod, Databricks CLI 1.12.1 contre le serveur HTTP local : succès.
- Générateur : deux tables Delta, rerun stable, refus de changement implicite de schema, bindings analytiques SELECT conservés.
- Contrats/API : propriétaires isolés, namespace distinct, pagination, suppressions, écritures concurrentes, erreur ambiguë,
  origine exacte, refus du mode mémoire en production, payload borné, enveloppes et absence de cache.

Les tests SQL injectent un `SqlExecutor` factice. La recette de concurrence vérifie le modèle et les requêtes émises ;
elle ne prouve pas une exécution SQL distante. La matrice GitHub existante vérifie aussi les CLI 0.295.0 et 1.14.1.

## Parcours navigateur

Playwright CLI, Chromium, serveur local isolé sur `127.0.0.1:3194`, mode démo :

1. Bibliothèque vide visible, aucun contenu personnel simulé ajouté.
2. Enregistrement des préférences : 90 jours et tri par nom.
3. Ouverture de l’exemple sans paramètres : la période 90 jours est appliquée.
4. Sélection Nord / 7 jours et sauvegarde « Nord hebdomadaire ».
5. Retour à la bibliothèque : analyse présente et préférences conservées.
6. Modification du titre et ajout d’une note, puis lecture de la nouvelle version.
7. Ouverture : lien `region=north&periodDays=7`, prioritaire sur la préférence 90 jours.
8. Contrôle visuel desktop et mobile 390 × 844, thèmes clair et sombre.
9. Suppression confirmée puis rechargement : bibliothèque vide, préférences conservées.
10. Console de la page finale : aucune erreur ni warning.

Les captures locales restent sous `output/playwright/`, ignoré par Git. Elles contiennent uniquement la démo.

## Revue documentaire

Skills appliqués : `review-analytics-app-docs` et `prepare-template-release` du repository.
README, architecture, accès Databricks, déploiement, développement local, variables, manifests, guide d’upgrade et
commandes ont été comparés aux fichiers modifiés. Les sources analytiques restent distinctes des tables personnelles.

Verdict : **PRÊT AVEC RÉSERVES** pour la revue de code. Findings : 0 bloquant, 0 écart, 0 obsolète, 1 non vérifiable.
La réserve concerne la recette Databricks réelle : création des tables, droits effectifs, proxy et concurrence SQL
avec deux utilisateurs. Elle doit précéder l’activation décrite dans [user-state.md](user-state.md).

Aucun déploiement, grant, SQL d’écriture ou changement du repo IKEA n’a été exécuté. La PR laisse le flag désactivé.
