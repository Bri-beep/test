# Construire une app avec les capacités AppKit

## Du besoin à la première tranche

1. Définir l'utilisateur, son action et le résultat attendu avec `npm run app:guide`.
2. Choisir les capacités utiles. Le guide propose des usages et conserve le choix dans `config/app-spec.yml`.
3. Lire `npm run app:capabilities` pour connaître les ressources, la disponibilité dans le template et les vérifications.
4. Consulter `npm run app:skills`, puis les références amont utiles à cette étape.
5. Construire une tranche avec des données synthétiques. Configurer les accès réels quand ils deviennent nécessaires.

Exemple pour une app conversationnelle :

```bash
npm run app:guide -- --non-interactive --type assistant \
  --audience "Équipe commerciale" \
  --decision "Comprendre une variation de ventes" \
  --success "Une question fournit une réponse sourcée ou explique son absence" \
  --capabilities genie
npm run app:capabilities
npm run app:skills
npm run app:doctor
```

Pour combiner plusieurs usages, passer `--capabilities analytics,genie,personal-state`.
`--capabilities none` laisse le choix ouvert. Sans option, le mode non interactif conserve le choix existant.
Les anciennes specs sans champ `capabilities` conservent le parcours `analytics`.
Les types `assistant` et `workflow` complètent `dashboard`, `cockpit` et `suivi`.

Les choix de la spec décrivent l'intention. Ils ne montent aucun plugin, n'ajoutent aucun droit et ne créent aucune ressource.
Ce champ est distinct des capabilities de `.valiuz-template.yml`, qui suivent les contrats et migrations du template.
Le catalogue décrit le socle du template ; il ne certifie pas l'intégration dans une app modifiée.
`feature:new` génère seulement un KPI simple et ajoute `analytics` aux capacités de la spec.
Une app sans KPI suit directement le guide de la capacité choisie.

## Catalogue revu

`config/appkit-capabilities.json` est le catalogue Valiuz pour AppKit 0.76.1.
Il alimente le guide, le brief, le contrôle des skills et le doctor.
Afficher toutes les options avec `npm run app:capabilities -- --all` ou ajouter `--json` pour une sortie structurée.

| Capacité | Usage | État dans le template |
| --- | --- | --- |
| `analytics` | KPI, filtres, agrégations | Intégrée via `SqlExecutor` ; lectures supportées par AppKit |
| `genie` | Questions sur les données | Plugin programmatique actif ; client de compatibilité et chat Valiuz |
| `personal-state` | Analyses et préférences | Fonction Valiuz optionnelle, sans nouveau plugin |
| `files` | Fichiers dans des Volumes UC | Plugin GA disponible ; intégration de feature à réaliser |
| `serving` | Prédiction ou génération | Plugin GA disponible ; intégration de feature à réaliser |
| `jobs` | Lancer et suivre un Job | Plugin GA disponible ; intégration de feature à réaliser |
| `lakebase` | Transactions métier | Plugin GA disponible ; besoin et stockage à confirmer |
| `ai-search` | Recherche sémantique ou hybride | Plugin bêta ; décision préalable et intégration à réaliser |
| `agents` | Assistant utilisant plusieurs outils | Plugin bêta ; décision préalable et intégration à réaliser |

Ce catalogue couvre les usages retenus pour l'accompagnement. Il ne remplace pas la liste complète des plugins amont.
Pour examiner une nouvelle capacité, consulter l'index des docs du package installé :

```bash
npx --no-install appkit docs
npx --no-install appkit docs ./docs/plugins/files.md
```

Le registre `config/appkit-resources.generated.json` est une projection Valiuz, pas un manifeste de scaffolding AppKit.
Ce template ne fournit pas `appkit.plugins.json` ; `appkit plugin list` sans manifeste ne permet donc pas d'inventorier ses plugins.
Conserver le parcours `init-app`. Ne pas relancer un scaffold amont dans une app existante.

## Contrat commun à une nouvelle intégration

Avant de brancher un plugin, préciser dans le document de conception de la tranche :

- L'action utilisateur et son critère d'acceptation
- La ressource existante à réutiliser ou le besoin de création
- L'identité de l'appel : utilisateur OBO ou service principal
- Les entrées et sorties, les limites, les effets d'écriture et la politique de reprise
- Les routes réellement montées et la manière de conserver les validations de feature
- Les tests locaux, la recette distante et le retour arrière

Lire les signatures dans le package installé. Garder route → service → repository/adaptateur.
Les intégrations programmatiques ne doivent pas exposer de routes génériques qui contournent les règles métier.
Lorsque le package ne permet pas ce contrat, conserver un adaptateur et documenter son critère de retrait.
Le cache reste désactivé sans contrat explicite de fraîcheur et d'identité.

Les déclarations actuelles couvrent tables/vues, Genie et état personnel.
Pour un Volume, un endpoint, un Job ou Lakebase, étendre le contrat de ressources et son rendu avec des tests.
Ne pas ajouter une ressource uniquement dans un fichier généré : la prochaine génération la supprimerait.
Conserver un seul `app.yaml` et les privilèges minimaux. Les commandes de cadrage ne font pas ces extensions.
Les créations, écritures, lancements et déploiements distants demandent une autorisation couvrant leurs cibles.

## Files

Définir les Volumes et les actions permises : lecture, import, export ou suppression.
Une consultation ne justifie pas de droit d'écriture. Un simple téléchargement produit depuis une API n'exige pas un Volume.
Valider chemin, nom, type et taille avant l'appel. Tester les sorties de périmètre, les refus d'accès et les imports invalides.
Lire la référence Files du skill Apps et la [documentation Files](https://developers.databricks.com/docs/appkit/v0/plugins/files).

## Serving

Réutiliser un endpoint nommé et valider son schéma d'entrée/sortie.
Distinguer un modèle renvoyant un JSON d'un modèle conversationnel compatible streaming.
Borner appels, latence et volume ; présenter les erreurs sans réponse technique brute.
Consulter `databricks-model-serving` si la création ou la gestion de l'endpoint est nécessaire.
Lire la [documentation Model Serving](https://developers.databricks.com/docs/appkit/v0/plugins/model-serving).

## Jobs

Le plugin donne accès à des Jobs déclarés depuis l'app. Il ne remplace pas leur définition dans un bundle.
Limiter les Jobs et paramètres autorisés ; séparer lancement et consultation d'état.
Après un lancement ambigu, rechercher son état sans soumettre automatiquement une seconde exécution.
Une préparation dans `data/` reste indépendante ; elle ne demande ce plugin que si l'app doit la piloter.
Consulter `databricks-jobs` et la [documentation Jobs](https://developers.databricks.com/docs/appkit/v0/plugins/jobs).

## Lakebase

Évaluer Lakebase pour des transactions métier ou un besoin démontré de faible latence.
Choisir explicitement une base existante ou une nouvelle ressource, avec un schema et des migrations maîtrisés.
Les préférences et analyses sauvegardées du template conservent leur [état personnel Delta](user-state.md).
Ne pas synchroniser des tables pour un filtre qui peut être servi par une requête SQL bornée.
Consulter `databricks-lakebase` et la [documentation Lakebase](https://developers.databricks.com/docs/appkit/v0/plugins/lakebase).

## AI Search

Une recherche sémantique ou hybride demande un index déclaré et un contrat de filtrage par identité.
Un filtre de tableau ne suffit pas à justifier cette ressource.
Consigner l'acceptation de la bêta avant intégration et tester pertinence, limites et refus d'accès.
Consulter `databricks-vector-search` et la [documentation AI Search](https://developers.databricks.com/docs/appkit/v0/plugins/ai-search).

## Agents

Le plugin `agents` héberge des agents dans l'application. Les skills de développement installés sur le poste sont distincts.
Choisir cette capacité lorsqu'une action demande plusieurs outils ; Genie ou Serving peuvent suffire pour un besoin plus simple.
Consigner l'acceptation de la bêta et une liste explicite d'outils, d'identités, de budgets et d'approbations.
Ne pas hériter automatiquement de tous les outils ou skills disponibles.

Les skills embarqués décrivent le métier de l'agent ; ne pas y copier les skills de développement du template.
La version 0.76.1 découvre les définitions sous `server/agents/`. Cette convention diffère de notre dossier `src/server`.
Adapter explicitement la découverte et le build ; vérifier le chargement des définitions et de leurs ressources en production.
Un outil personnalisé ne garantit pas l'OBO. Tester son identité réelle avant de le présenter comme un appel utilisateur.

Tester les demandes hors périmètre, les instructions contenues dans des documents, l'isolation et l'interruption.
Les mutations nécessitent une approbation adaptée et ne doivent pas être rejouées après un résultat ambigu.
Lire la [documentation Agents](https://developers.databricks.com/docs/appkit/v0/plugins/agents) et les [niveaux de stabilité](https://developers.databricks.com/docs/appkit/v0/plugins/stability).

## Genie

Suivre [le parcours Genie](genie.md) pour cadrer le Space, préparer les définitions et vérifier les réponses.
`app next` rappelle cette revue lorsque Genie est sélectionné. Le plugin runtime et les skills de développement sont distincts.
Les mises à jour AppKit doivent préserver OBO, envoi unique, annulation, erreurs sûres et résultats bornés.
