# Migration volontaire de 1.4.0 ou 1.5.0 vers 2.0.0

La version 2.0.0 remplace le runtime Next.js par AppKit/Express, Vite et React Router. React reste la bibliothèque UI.
Les applications 1.4.0 et 1.5.0 continuent de fonctionner sans migration automatique.
Les requêtes métier, déclarations d’accès, tables personnelles et personnalisations Valiuz restent propres à chaque application.

## Obtenir le bilan depuis le template cible

Utiliser un checkout de la version 2.0 relue, dans un dossier distinct de l'app. Installer ses dépendances avec `npm ci`.
Ne pas exécuter `init-app` dans l'app existante. Depuis ce checkout cible :

```bash
npm run app -- migrate --app-dir /chemin/vers/ancienne-app
npm run app -- migrate --app-dir /chemin/vers/ancienne-app --json
```

La version vient de `.valiuz-template.yml`. Si elle n'est pas suivie, examiner l'historique puis fournir `--from 1.4.0` ou `--from 1.5.0`.
Une version fournie ne remplace jamais silencieusement un état contradictoire.
Les guides viennent du checkout cible : le manifeste copié dans une ancienne app ne connaît pas les versions futures.
Si la cible déclare `2.0.1`, appliquer ensuite le [correctif des résultats SQL vides](../template/upgrades/2.0.0-to-2.0.1.yml)
sur la même branche. Les étapes ci-dessous décrivent le portage du runtime vers `2.0.0` ; le guide du patch complète
les validations et la mise à jour finale de `.valiuz-template.yml`, sans nouvelle capability.
`template:diff` affiche toujours un seul guide direct ; le bilan `app migrate` assemble les étapes nécessaires.

Le bilan repère les pages, layouts, handlers, imports Next.js, candidats serveur et noms `NEXT_PUBLIC_*`.
Il ignore `.env.local`, les dépendances et les sources liées par symlink. Il n'affiche pas les valeurs de l'environnement.
Ce relevé statique n'est pas exhaustif. Examiner aussi les middleware, rewrites, Server Actions, routes dynamiques,
Pages Router, authentification et conventions propres à l'app. Le bilan n'exécute aucun test ni modification.

## Partir de 1.4.0

Appliquer les contrats du [guide 1.4 → 1.5](../template/upgrades/1.4.0-to-1.5.0.yml), puis le portage 1.5 → 2.0 décrit ici.
Ces étapes peuvent rester sur la même branche de migration, avec une revue distincte pour chaque contrat.
Ajouter les modules personnels, leurs routes, le flag du shell et les variables optionnelles, sans activer le stockage.
Conserver `USER_STATE_ENABLED=false` si l'app n'en a pas besoin. Aucune table, permission MODIFY ou exécution de
`user-state:init` n'est nécessaire pour ce parcours. Une activation ultérieure suit [le guide personnel](user-state.md).
La capability `personal-user-state` décrit la présence du code, pas l'activation d'un stockage.
Préserver les éventuels stockages métier préexistants et leurs garanties ; ils ne sont pas convertis automatiquement.

## Préparer la branche

1. Créer une branche dédiée depuis la révision de production.
2. Conserver le SHA déployé pour le rollback.
3. Exécuter les validations de la version de départ avant toute modification.
4. Dans le checkout cible, examiner le bilan puis `npm run template:diff -- --from 1.5.0 --to 2.0.0`.
5. Inventorier les pages, handlers, chargements serveur, personnalisations et usages de Next.js.
6. Relever les résultats attendus des tests métier.

## Porter les fichiers du socle

Fusionner les fichiers nommés dans le guide YAML. Ne pas remplacer un dossier métier complet.
Fusionner `package.json`, puis exécuter `npm install` avec Node.js 22.16+.
Les versions initiales de `@databricks/appkit` et `@databricks/appkit-ui` sont exactement `0.76.1`.
Le Vite utilisé correspond à la dépendance d’AppKit. Le lockfile reste dans Git.

| Contrat Next.js 1.4/1.5 | Contrat 2.0 |
| --- | --- |
| `src/app/<route>/page.tsx` | `src/client/pages/<route>/page.tsx`, enregistré dans `src/client/routes.tsx` |
| `src/app/layout.tsx` | Shell dans `src/client/main.tsx` et document dans `index.html` |
| Server Component ou page `async` | Handler dans `src/server/routes/`, service existant, chargement client avec états explicites |
| `src/app/api/<route>/route.ts` | Handler Express dans `src/server/routes/<route>/route.ts`, enregistré directement dans `src/server/routes.ts` |
| `NextResponse.json` | Valeur JSON retournée par `withApiRoute`, ou `response.status(...).json(...)` |
| `await routeContext.params` | `request.params` |
| `new URL(request.url).searchParams`, `await request.json()` | `request.query`, `request.body`, validés avec Zod |
| `request.signal` | `context.signal` fourni par `withApiRoute` |
| `next/navigation` | `useLocation`, `Link`, paramètres de React Router |
| `next/image` | `img` avec dimensions et texte alternatif |
| `generateMetadata` | Configuration publique validée par `/api/config` et métadonnées HTML |
| `server-only` | Séparation serveur et contrôle des imports dans `vite.config.ts` |
| `npm run build` | Vite pour `dist/client`, esbuild pour `dist/server/index.js` |
| `npm run start` | Serveur AppKit en production, port injecté par Databricks Apps |

Les handlers conservent `withApiRoute`, les identifiants de requête et l’enveloppe publique d’erreur.
Le callback devient `(request, context, response)` avec les objets Express natifs. Supprimer les ponts
`expressRoute`, les handlers Web et les paramètres de route asynchrones. Pour un flux, attendre son écriture
dans `response` et respecter `context.signal` ; ne pas retourner un objet Web `Response`.
Le parseur AppKit borne le corps JSON décodé à 64 Kio. L’état personnel borne en plus le JSON sérialisé à 16 Kio.
La 2.0 adopte le décodage JSON d’Express ; elle ne reproduit plus le lecteur brut strict UTF-8 de la 1.x.
Les réponses et erreurs d’API reçoivent `private, no-store`, un `requestId` et l’enveloppe d’erreur commune.
Supprimer les exports `dynamic`, `runtime` et les mécanismes propres à Next.js après leur portage.
Supprimer `next.config.mjs`, `next-env.d.ts`, `src/instrumentation.ts` et `scripts/prepare-standalone.mjs`.
Retirer les dépendances `next`, `eslint-config-next` et `server-only`.
Retirer aussi les directives `use client` devenues inutiles lors des prochaines modifications des composants.

## Préserver les données et identités

Les responsabilités `service → repository → SqlExecutor` restent séparées.
Le runtime utilise AppKit analytics pour les lectures compatibles.
Porter explicitement les marqueurs SQL et les bindings des repositories :

```ts
// 1.x : statement: "SELECT ... FROM IDENTIFIER(?) WHERE day >= ?", parameters: [source, startDate]
statement: "SELECT ... FROM IDENTIFIER(:source) WHERE day >= :startDate",
parameters: { source, startDate },
```

Les valeurs restent liées par le transport. Les marqueurs répétés réutilisent la même clé.
Ne pas remplacer aveuglément les `?` présents dans les chaînes ou commentaires SQL. Mettre à jour les tests du repository.
L’exécuteur 2.0 ne réécrit pas le SQL et n’accepte plus de tableau de paramètres positionnels.
Les lignes restent validées avec Zod. Le nom, la limite et le délai restent obligatoires au niveau du contrat.

AppKit omet les paramètres nuls et transforme certaines chaînes JSON en objets.
Les paramètres nuls utilisent automatiquement le driver avant la soumission.
Pour une colonne STRING qui peut contenir du JSON, ajouter `transport: "driver"` à sa requête.
Les nombres, booléens et dates JSON_ARRAY arrivent sous forme de chaînes depuis le Statement Execution API.
Si le contrat existant attend des types natifs du driver, conserver aussi `transport: "driver"`.
Les KPI générés acceptent déjà les nombres avec `z.coerce.number()`.
Cette option conserve les valeurs d’origine. Ne pas élargir un schéma Zod pour masquer une différence de transport.

Porter l’orchestration Genie vers AppKit et conserver le client HTTP de compatibilité ainsi que ses tests OBO.
L’exception AppKit est détaillée dans [la maintenance amont](appkit-maintenance.md).
Les écritures personnelles utilisent leur repository privé et le driver existant.
Les tables, namespaces, identités propriétaires et définitions enregistrées ne changent pas.

Conserver `config/data-access.json`, `config/genie-spaces.json`, `data/` et les variables métier.
Exécuter `npm run data:access:render` pour produire les métadonnées AppKit et les bindings.
Les sources analytiques gardent SELECT. Seules les deux tables personnelles conservent MODIFY incluant SELECT.

## Variables et déploiement

Les variables APP, DATABRICKS et USER_STATE conservent leurs noms.
Le serveur traduit `DATABRICKS_SQL_WAREHOUSE_ID` vers la variable interne AppKit `DATABRICKS_WAREHOUSE_ID`.
Ne pas créer un second binding warehouse.
Le profil OAuth local reste renouvelé par le CLI. Databricks Apps conserve ses credentials injectés.

Retirer les variables `NEXT_PUBLIC_*` et exposer chaque valeur nécessaire via un contrat public validé.
Ne pas convertir les credentials en variables Vite. Le build n’expose aucune variable d’environnement automatiquement.
Le build fonctionne sans credentials, même avec `APP_MODE=databricks`.

Conserver un seul `app.yaml` avec `npm run start`.
Conserver la source Git de production, les gates et la confirmation des mutations distantes.
En local, `PORT` vaut 3000 par défaut ; `DATABRICKS_APP_PORT` reste prioritaire.
`APP_HOST` permet un bind local explicite. `NODE_ENV` choisit Vite ou les fichiers de production.

## Valider et déclarer la migration

Fusionner les scripts de cadrage, `config/appkit-capabilities.json` et les références de skills locales.
Conserver les valeurs métier de `config/app-spec.yml`. Sans champ `capabilities`, la spec garde le parcours Analytics.
Exécuter `npm run app:guide -- --non-interactive` pour ajouter ce choix et régénérer le brief sans perdre les features.
Examiner `npm run app:capabilities` et `npm run app:skills`. Aucun plugin n'est activé par ces commandes.
Fusionner aussi les modules de [comparaison facultative](period-comparison.md), leurs exports et le générateur indiqué
dans le guide YAML. Les features migrées restent identiques ; ajouter une comparaison est une décision métier distincte.
Fusionner les modules de partage et la référence locale `sharing.md` indiqués dans le guide YAML.
Garder la prop `sharing` absente pour conserver le comportement d'une vue existante.
Son activation demande une clé stable et une revue des filtres partageables. Elle ne crée aucun stockage ni droit supplémentaire.

1. Exécuter lint, typecheck, tests unitaires et build.
2. Exécuter `npm run test:e2e` et vérifier les thèmes, le clavier et le mobile.
   Après le build, exécuter aussi `E2E_PRODUCTION=1 npm run test:e2e` pour les fichiers statiques de production.
   Ce second parcours vérifie l’état personnel désactivé : le stockage de démo reste réservé au développement.
3. Exécuter `npm run bundle:compatibility`.
4. Exécuter `npm run template:check -- --to 2.0.0`.
5. Après succès, déclarer la version 2.0.0 dans `.valiuz-template.yml`.
6. Ajouter les capabilities `appkit-native-runtime`, `upstream-compatibility`, `guided-appkit-capabilities`, `period-comparison`, `appkit-genie-integration` et `comparison-sharing`.
7. Ajouter `1.5.0-to-2.0.0` dans `appliedUpgrades`.
   Pour une origine 1.4, ajouter aussi `personal-user-state` et `1.4.0-to-1.5.0` après validation de leurs contrats.
8. Exécuter `npm run app:doctor` et `npm run check`.
9. Après autorisation, déployer en développement et effectuer la recette distante.

Le repository source fournit `npm run template:migration`, avec son historique Git contenant les révisions 1.4 et 1.5.
Cette commande de recette du template n’est pas exécutable dans un repository d’application sans cet historique.
Cette validation initialise deux fixtures avec une feature métier, vérifie le bilan, applique le portage décrit et vérifie les builds.
La fixture 1.4 garde l'état personnel désactivé sans table déclarée ni binding MODIFY.
La fixture 1.5 conserve ses déclarations de tables personnelles. Aucun DDL n'est exécuté.
Les sources, services, contrats métier et personnalisations sont comparés avant et après migration.
Pour le SQL, seuls les marqueurs, bindings et attentes des tests correspondants changent ; les calculs sont conservés.
Une requête HTTP sur le handler natif vérifie aussi la valeur de démo après portage.
Les seuls ajouts de configuration à la fixture 1.4 sont les variables personnelles optionnelles et désactivées.
Ces fixtures couvrent le contrat du template ; chaque application doit aussi tester ses adaptations.

La recette distante couvre deux utilisateurs Genie, l’isolation personnelle, la reprise après redémarrage et les logs.
Elle reste nécessaire avant adoption en production.
Le rollback redéploie le SHA précédent puis aligne Git par pull request. Il ne supprime aucune table.

## Porter Genie et le contexte de comparaison

Conserver les alias, les bindings et les callbacks existants. Porter ensemble `src/features/genie/server`,
`src/server/genie-plugin.ts`, l’enregistrement dans `src/server/index.ts` et la route de session.
Le plugin AppKit reçoit les ressources du registre existant ; aucun second manifeste ni nouveau droit n’est requis.
Garder le client HTTP de compatibilité pour les opérations encore non conformes dans AppKit 0.76.1.
Ne pas ajouter les routes génériques du plugin et ne pas basculer de transport après une erreur d’envoi.
Le serveur configure `sendMessage` au démarrage. Les tests qui appellent directement `streamGenieMessage`
doivent aussi configurer le plugin ou injecter cette dépendance ; la fixture `tests/fixtures/genie-appkit.ts`
exerce le vrai plugin avec un client synthétique, sans credential.

`GenieChat` garde son API ; `initialQuestion` est facultatif et n’envoie rien automatiquement.
Porter un client SSE personnalisé vers les champs AppKit au premier niveau : `status`, `message`, `data`, selon
le type d’événement. L’ancienne enveloppe `{ type, data: ... }` n’est plus acceptée. Le message final précède ses
résultats ; attendre la fin du flux et toutes les pièces jointes attendues avant de permettre une nouvelle question.
Le lecteur `connectSSE` est configuré avec `maxRetries: 0` ; ne pas adopter les reprises de POST du hook amont par défaut.
La prop `genie` de `PeriodComparison` est également facultative. La renseigner seulement après validation du Space,
des sources, des définitions et des périodes. Voir [le parcours](genie.md).
Les tables d’état personnel restent inchangées ; le contexte enrichi et les résultats ne sont pas persistés.
Tester OBO, interruption, refus, troncature et absence de double envoi avant la recette distante autorisée.
