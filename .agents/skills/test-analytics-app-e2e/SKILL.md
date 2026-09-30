---
name: test-analytics-app-e2e
description: Planifier, implémenter et diagnostiquer des tests Playwright pour les parcours critiques d'une application analytics, notamment les filtres, KPI, tableaux et états de chargement, vide ou erreur.
---

# Mission

Prouver les parcours utilisateur importants dans un vrai navigateur avec des tests lisibles et reproductibles. Faire
la différence entre une régression produit, un défaut du test et un problème d'environnement avant de modifier le code.

# Préparer le parcours

1. Lire les instructions du repository, `README.md`, `docs/product-brief.md` lorsqu'il existe et l'architecture de l'app.
2. Inspecter le statut Git, les scripts npm, le framework, les tests existants et la configuration Playwright éventuelle.
3. Identifier l'utilisateur, sa décision, le point d'entrée, les données nécessaires et le critère d'acceptation.
4. Privilégier le mode démo et des données synthétiques déterministes. Un test local ne doit pas demander de credential.
5. Poser au maximum trois questions si le résultat fonctionnel ou l'environnement cible reste ambigu.

Pour un nouveau parcours, écrire d'abord un plan court sous `e2e/specs/<parcours>.md`, ou mettre à jour le plan existant.
Le plan contient : préconditions, fixture, étapes utilisateur, assertions observables, états alternatifs et éléments hors
scope. Ne déduire une attente ni d'une implémentation défectueuse, ni d'une capture d'écran isolée : la relier au brief,
à une règle métier ou à une confirmation utilisateur.

# Préparer Playwright si nécessaire

Si la demande autorise l'ajout des tests et que Playwright n'est pas configuré :

- ajouter `@playwright/test` comme dépendance de développement avec le gestionnaire de paquets du repository ;
- créer une configuration qui utilise une `baseURL`, démarre l'application en mode démo et conserve trace et capture
  lors d'un échec ;
- ajouter des scripts explicites pour la suite E2E et inclure ses fichiers dans le lint ;
- utiliser Chromium par défaut ; ajouter d'autres navigateurs seulement lorsqu'un besoin de compatibilité le justifie ;
- ignorer les rapports, traces, vidéos et captures générés sans masquer les spécifications ou tests sources.

Ne pas remplacer une configuration existante sans comprendre ses projets, son serveur et sa CI. Ne pas cibler une app
distante, partagée ou de production sans accord explicite sur l'URL, l'identité et les conséquences possibles.

# Implémenter le test

- Transformer chaque scénario en un test indépendant qui commence depuis un état connu.
- Utiliser en priorité les rôles, noms accessibles et labels. Ajouter un `data-testid` seulement lorsqu'aucun contrat
  utilisateur stable n'existe.
- Attendre un état observable de l'interface ou une réponse précise ; ne pas utiliser de pause arbitraire.
- Vérifier le résultat utile à l'utilisateur, pas les classes CSS, l'arbre interne React ou le détail d'implémentation.
- Garder les fixtures synthétiques. Ne jamais enregistrer de réponse contenant des données client ou personnelles.
- Tester au minimum le chemin nominal et l'état alternatif qui porte le plus de risque : vide, erreur, retard ou filtre
  sans résultat.
- Pour un dashboard, vérifier les unités, périodes et libellés visibles des KPI ainsi que l'effet d'au moins un filtre
  important. Tester le clavier lorsque le parcours comporte une interaction non triviale.
- Garder `/health` comme vérification superficielle. Tester séparément toute connectivité distante et uniquement sur
  demande explicite.

Préférer les fixtures de démo de l'application aux interceptions réseau. Utiliser une interception ciblée lorsqu'elle
est nécessaire pour provoquer un état difficile, sans reproduire toute la logique du service dans le test.

# Exécuter et diagnostiquer

1. Exécuter d'abord le test ciblé, puis la suite E2E complète et les validations exigées par le repository.
2. En cas d'échec, consulter le message, la trace, la capture et les logs sûrs avant de changer un sélecteur ou une
   attente.
3. Classer la cause : comportement produit, attente incorrecte, donnée non déterministe, environnement ou test flaky.
4. Corriger la cause minimale. Ne pas affaiblir une assertion, ajouter un retry ou augmenter un timeout uniquement pour
   obtenir un test vert.
5. Rejouer le test corrigé plusieurs fois lorsqu'un défaut de stabilité était suspecté, puis relancer la suite.

Une réparation automatique n'est acceptable que si le comportement attendu reste prouvé. Si l'interface a réellement
régressé, corriger le produit ou signaler le défaut au lieu d'adapter silencieusement le test.

# Handoff

Rapporter les parcours couverts, les états non couverts, les navigateurs réellement exécutés, les commandes lancées et
les éventuelles dépendances à un environnement externe. Ne jamais annoncer un test réussi s'il n'a pas été exécuté.
