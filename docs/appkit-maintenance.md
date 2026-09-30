# Maintenance AppKit et guidance Databricks

Databricks fournit le runtime, les plugins et les intégrations via les packages npm.
Valiuz maintient la marque, les frontières métier, les accès déclarés et les tests de compatibilité.
Le repository ne contient aucun fork d’AppKit et ne publie aucun package Valiuz séparé.

## Versions et contrat

`config/appkit-compatibility.json` contient les versions testées et les révisions amont revues.
Les packages AppKit et AppKit UI commencent à 0.76.1, avec des versions exactes et un lockfile.
Les composants Valiuz existants conservent leurs contrats. Aucun composant AppKit UI ne remplace implicitement leur comportement.
Lors d’une adoption de composant UI, associer ses tokens aux variables de `src/client/globals.css`.

`app:doctor` compare le package, le lockfile, l’installation et la matrice CLI.
Il signale les écarts sans installer ni modifier de fichier.
`config/appkit-resources.generated.json` décrit la correspondance des ressources ; ce fichier est généré par Valiuz.
Il ne remplace ni un manifeste AppKit upstream ni le bundle Databricks.
`data:access:check` vérifie sa cohérence avec les déclarations d’accès.

Les caches de résultats AppKit restent désactivés.
Les routes génériques analytics ne sont pas montées.
Le serveur standard AppKit parse le JSON avec une limite de 64 Kio. Les routes utilisent directement Express.
L’état personnel borne son JSON sérialisé à 16 Kio. Le wrapper normalise aussi les erreurs du parseur.
L’ancien pont Web Request/Response et l’accès au champ privé `serverApplication` ont été supprimés.
Le recorder UI automatique de développement est remplacé par un plugin sans route.
Les APIs des features gardent les limites de corps, l’identité et leurs validations.

## Exceptions suivies

| Exception | Motif dans 0.76.1 | Critère de retrait |
| --- | --- | --- |
| Client de compatibilité Genie derrière le plugin actif | Signal absent sur plusieurs appels, reprises SDK, erreurs brutes et pièces jointes sans statementId ignorées | Même contrat avec le client amont par défaut : OBO, soumission unique, annulation, lectures bornées, erreurs sûres et 500 lignes |
| Driver SQL conservé | Écritures privées, paramètres nuls, types natifs, chaînes JSON exactes et diagnostics CLI | Parité explicite de ces contrats dans l’API programmatique |
| Client de démo | AppKit lit l’identité workspace dès son démarrage | Serveur upstream utilisable sans identité distante |
| Fournisseur OAuth CLI | AppKit ignore le profil lorsque le host est fourni | Profil nommé, host validé et renouvellement natifs |
| Résultat JSON vide | Statement Execution peut renvoyer `result: {}` après succès sans ligne ; AppKit ne produit alors pas `data` | AppKit retourne un tableau vide pour un résultat vide prouvé par le manifeste |

Le client normalise le résultat vide seulement après `SUCCEEDED`, avec format `JSON_ARRAY`, schéma de colonnes,
zéro ligne et zéro chunk déclarés, sans troncature ni données ou chunk suivant. Un résultat incomplet reste une erreur.
Cette adaptation corrige `/api/readiness` sans modifier sa requête, masquer un refus d’accès ou rejouer une soumission.
La fixture `tests/fixtures/appkit-contract.ts` vérifie ce contrat avec le package AppKit installé.

L’adaptateur SQL transmet un signal de délai et borne le résultat inline.
Il demande l’annulation d’un statement connu lors du dépassement.
Une soumission distante interrompue avant réception de son identifiant reste ambiguë.
Le serveur ne promet pas l’annulation effective du compute.
Les erreurs du client SQL sont neutralisées avant les logs AppKit.
Les logs applicatifs gardent seulement le nom de requête, sa durée, son identifiant et le nombre de lignes.

Le plugin Genie utilise `sendMessage` via le service Valiuz. Le client lié à la requête conserve les garanties
manquantes et les types exacts des cellules. Les routes génériques restent désactivées et aucun fallback ne suit une soumission.
Le chat Valiuz garde son contexte et ses callbacks ; le bouton d’exploration utilise AppKit UI.
Le lecteur de flux utilise `connectSSE` d’AppKit UI avec `maxRetries: 0`. Les événements suivent les champs et l’ordre
AppKit ; il n’existe plus de parseur SSE local ni de deuxième format d’événements accepté.
Le hook complet amont n’est pas utilisé : ses reprises de POST et ses limites de contexte/interruption ne conviennent pas.
Avant le flux, son lecteur ne fournit au client que le statut HTTP ; l’API conserve son enveloppe sûre et son identifiant.
Voir [le contrat Genie](genie.md) pour la recette avant retrait de l’adaptateur.

## Skills et plugins d’agents

Les plugins runtime npm, les skills de développement et les skills d'agents embarqués sont trois éléments distincts.
Les skills Valiuz sont livrés sous `.agents/skills`. Ils orientent vers les guides Databricks et gardent les décisions locales.
Les skills amont restent installés hors du code copié dans les applications ; ils ne sont ni copiés ni réécrits dans le template.

`npm run app:skills` propose le socle de six skills et les spécialistes utiles aux capacités de `config/app-spec.yml`.
La commande n'installe rien. Pour examiner un dossier externe :

```bash
npm run app:skills -- --directory /chemin/vers/les/skills
npm run app:doctor -- --skills-dir /chemin/vers/les/skills
```

Le contrôle compare le nom et l'empreinte SHA-256 de chaque `SKILL.md` avec le registre.
Il distingue absence, entrée invalide, différence, présence non revue et correspondance.
Il ne compare pas les références annexes et ne prouve pas que l'assistant a chargé le skill.
Sans dossier explicite, l'installation reste non vérifiée. Ajouter `--check` à `app:skills` pour échouer sur toute entrée non conforme.
Les contrôles CI et la démo ne dépendent pas d'une installation personnelle.

Pour une création ou une reprise, `app:orchestrate --json --skills-dir <dossier>` sélectionne les skills utiles à l'étape.
Son champ `missingInstall` propose uniquement les entrées absentes, sans exécuter l'installation.
L'agent examine l'aide du CLI installé, cible son assistant, installe dans le périmètre autorisé et relance le diagnostic.
Les entrées modifiées, invalides ou non revues demandent une lecture ; elles ne sont pas réinstallées automatiquement.
La reprise suit [la référence d'orchestration](../.agents/skills/create-analytics-dbx-app/references/orchestration.md).

Installer la guidance avec le [CLI Databricks officiel](https://github.com/databricks/databricks-agent-skills) :

```bash
databricks aitools install --scope global --skills-only \
  --skills databricks-core,databricks-apps,databricks-dabs,databricks-dbsql,databricks-app-design,databricks-data-discovery
```

Vérifier `databricks aitools install --help` ; ajouter `--agents <assistant>` pour choisir un seul outil.
Cette commande installe des skills, sans ajouter de hooks ou de plugin d'assistant.
Les nouveaux skills deviennent disponibles pour l'assistant au prochain tour ou après rechargement de son catalogue.
Le registre indique la release revue 0.2.10 et sa révision source. Le CLI peut installer une version plus récente.
Examiner les différences avant d'avancer les révisions et empreintes ; ne pas remplacer une empreinte pour faire passer le contrôle.
Les skills Valiuz ajoutent les règles de marque, les catalogues autorisés, les KPI et les releases.
Le plan de migration Valiuz prime sur les suggestions de scaffolding générique.
Il conserve les APIs de features et Delta personnel sans ajouter Lakebase.
Le [parcours des capacités](appkit-capabilities.md) décrit la sélection des plugins et les étapes d'intégration.

La [documentation AppKit livrée avec les packages](https://developers.databricks.com/docs/appkit/v0/plugins/server) décrit les APIs exactes.
Les [plugins GA](https://developers.databricks.com/docs/appkit/v0/plugins/stability) sont préférés.
Une adoption beta exige une décision documentée et des tests spécifiques.

## Revue hebdomadaire

Dependabot ouvre des PR npm chaque semaine et groupe AppKit avec AppKit UI.
Aucun workflow ne fusionne automatiquement ces PR.
Le mainteneur examine les changements, les exceptions et les résultats de CI avant fusion.

Le workflow `upstream-check.yml` compare les révisions revues avec les branches amont.
Il produit uniquement un résumé CI avec des liens et fichiers modifiés.
Il ne met à jour aucune dépendance ni révision.
Les permissions GitHub restent en lecture seule.

Après revue, avancer les révisions dans le registre par une PR.
Exécuter les tests de compatibilité, les parcours consommateur et migration, le build et Playwright.
Toute nouvelle version du template reste une migration guidée pour les applications existantes.
