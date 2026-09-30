# Livraison par tranches verticales

Utiliser ce parcours lorsqu'une tranche fonctionnelle possède un objectif, des sources et des critères d'acceptation
suffisamment clairs.

## Avant de modifier

1. Relire `docs/product-brief.md`, `docs/architecture.md`, `docs/databricks.md` et les instructions du repository. Lire
   aussi `docs/local-development.md` avant toute utilisation de vraies données.
2. Inspecter le statut et le diff. Ne pas mélanger du travail existant avec la nouvelle tranche.
3. Vérifier que chaque source utilisée est déclarée dans `config/data-access.json` sous le projet sélectionné et que
   `npm run data:access:check` passe.
4. Créer ou utiliser une branche de feature dédiée. Ne pas pousser sans autorisation explicite.
5. Résumer le critère d'acceptation et les fichiers probablement concernés.
6. Lire le plan `npm run app:capabilities` et la référence amont du plugin réellement utilisé.
   Pour une capacité optionnelle, suivre `docs/appkit-capabilities.md` avant d'enregistrer le plugin.

## Construire un chemin complet

Pour la première tranche KPI simple, préférer `npm run feature:new -- <slug>`. Le générateur part d'une source déclarée,
crée page, carte KPI, route, service, repository, requête, fixture et tests, puis synchronise la spec et le brief. Il ne
génère que `count`, `sum` ou `avg` ; relire et adapter le SQL avant tout accès réel.

Pour Genie, réutiliser la feature existante. Pour Files, Serving, Jobs ou Lakebase, construire la tranche autour du
contrat d'action et d'un faux adaptateur déterministe. Ne pas créer une table ou un KPI artificiel pour utiliser le générateur.
Le choix dans `config/app-spec.yml` ne prouve pas que le plugin est monté ou que ses ressources existent.

Respecter la boundary du template :

```text
page ou composant de feature
  -> route avec withApiRoute
  -> service de feature
  -> repository de feature
  -> SqlExecutor
  -> Databricks SQL / Unity Catalog
```

- Mettre une page dans `src/client/pages/<route>/page.tsx` et l’enregistrer dans `src/client/routes.tsx`.
- Enregistrer son handler Express directement dans `src/server/routes.ts` avec `withApiRoute`.
  Lire `request.params`, `request.query` et le corps validé ; retourner le résultat JSON. Utiliser `context.signal`
  pour une opération annulable. Les repositories lient des paramètres nommés (`:source`, `parameters: { source }`).
  Ne pas recréer les ponts de handlers Web ni la traduction des paramètres positionnels de la 1.x.
- Garder l'UI métier dans `src/features/<feature>/` et les composants neutres partagés dans `src/components`.
- Mettre l'orchestration métier dans `server/service.ts`.
- Mettre les requêtes et contrats de lignes dans `queries.ts` et `server/repository.ts`.
- Utiliser des paramètres driver, un nom de requête stable, un timeout, une limite de lignes et un schéma Zod.
- Ne pas importer la configuration serveur, un client Databricks ou un repository depuis un module client.
- Garder `/health` superficiel ; placer une vérification distante dans un endpoint distinct.
- Pour un autre plugin, garder route → service → repository/adaptateur ; `SqlExecutor` reste réservé au SQL.
- Examiner les routes montées par le plugin. Si elles contournent les validations métier, utiliser son API programmatique
  sans exposition générique ou documenter le blocage. Conserver le cache désactivé sans contrat de fraîcheur et d'identité.

Commencer par une fixture de démo déterministe lorsque le contrat métier est validé mais que l'accès distant ne l'est
pas encore. La fixture doit être synthétique et ne contenir aucune ligne issue d'un client.
Faire intervenir `validate-analytics-kpis` pendant la définition et la revue du calcul.
Un faux exécuteur valide les contrats et le transport ; il ne prouve pas que le SQL calcule correctement le KPI.
Appliquer la distinction des preuves du [parcours complet](analytics-workflow.md).

## Tester la tranche

Ajouter des tests déterministes dans `tests/*.test.ts` avec un faux `SqlExecutor`. Couvrir au minimum le résultat nominal
et l'état vide ou l'erreur qui compte pour le critère d'acceptation. Les tests unitaires ne doivent pas dépendre du réseau
ou de credentials.

Avant le handoff, exécuter les commandes demandées par `AGENTS.md`, normalement :

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Lancer d'abord `npm run app:doctor` pour obtenir les incohérences et la prochaine action. Pour une preview réelle,
afficher le plan avec `npm run preview:real -- --profile <profil>` ; `--confirm` autorise ensuite les mutations sur la
target `dev`. `--prepare-data` ajoute des écritures et ne doit être utilisé que si elles ont aussi été approuvées.

Relire ensuite le diff complet, le statut final, la présence éventuelle de secrets ou de données sensibles, et la
neutralité du repository vis-à-vis des assistants de développement.

Utiliser automatiquement `review-analytics-app-docs` avant le handoff lorsqu'une tranche modifie le comportement, la
configuration, les routes, les sources, les droits ou l'exploitation de l'application. Corriger les écarts
documentaires qui appartiennent à la tranche autorisée.

Dans le repository source du template (`package.json` conserve `__PACKAGE_NAME__`), utiliser aussi
`prepare-template-release` après chaque feature ou correction de comportement. Dans une app initialisée, ne pas
augmenter la version du template pour une feature métier.

Utiliser `validate-analytics-kpis` lorsqu'une tranche ajoute ou modifie un KPI, un comparatif ou une conclusion
chiffrée. Utiliser `test-analytics-app-e2e` pour un parcours utilisateur critique ou lorsqu'une interaction entre page,
route et états UI ne peut pas être prouvée correctement par les tests unitaires.

## Boucle d'itération

Après chaque tranche :

1. Montrer ce que l'utilisateur peut maintenant faire.
2. Lister les hypothèses validées ou encore ouvertes.
3. Mettre à jour le brief et ordonner le backlog selon valeur, risque et dépendances.
4. Proposer une seule prochaine tranche, avec son critère d'acceptation.
5. Demander un retour ciblé sur le chiffre, la requête et l'usage avant d'élargir l'interface.

Réutiliser un retour ou un critère déjà donné. Pour une demande qui couvre plusieurs tranches, poursuivre le travail
autorisé ; poser une question seulement lorsqu'une décision métier manque. Distinguer dans le résultat final
démo testée, données réelles validées et mise en service vérifiée.

Pour un premier déploiement Git-backed, provisionner d'abord l'app sans la démarrer afin d'obtenir son service
principal, puis faire configurer son credential Git en lecture. Un déploiement normal doit épingler le commit exact et
se terminer par les contrôles authentifiés `/api/health` et `/api/readiness`.

Une pull request, un déploiement ou un grant demande une autorisation explicite couvrant ses cibles.
Un test distant demande aussi une cible et un coût acceptés. Réutiliser les accords déjà donnés sans les redemander.
