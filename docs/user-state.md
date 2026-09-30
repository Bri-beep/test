# Analyses et préférences personnelles

La capability `personal-user-state` fournit une bibliothèque d’analyses et des préférences persistantes.
Elle reste désactivée par défaut. L’activer ajoute « Mes analyses » à la navigation.

Une analyse contient un nom, une note et une définition de filtres versionnée. L’ouverture relit la sauvegarde
du propriétaire et reconstruit un lien vers une vue connue. Cette vue doit recalculer ses données avec les droits
actuels du lecteur. Le template ne conserve aucun résultat SQL, instantané Genie, jeton ou email.

## Origine et choix de généralisation

Le point de départ est la feature `saved-analyses` de
[l’application IKEA](https://github.com/valiuz/analytics_dbx_app_small_ikea/tree/75338d7cf91a97c07a57b0e0f40ad418dfedd3b6/src/features/saved-analyses).
L’inspection porte sur les contrats, le repository, l’identité proxy, les migrations et les réglages personnels.

| Dans IKEA | Dans le template |
| --- | --- |
| Enseignes, catégories, placements et semaines éligibles | Définition stricte par vue ; un exemple région/période accompagne le socle |
| Bibliothèque, titre et note, restauration des filtres | Bibliothèque paginée, édition, suppression confirmée, réouverture |
| Préférences d’accueil, enseignes prioritaires, raccourcis | Préférences typées : période par défaut et ordre de la bibliothèque |
| Hash de l’identité proxy et namespace | Isolation par application, environnement et propriétaire dans toutes les requêtes |
| Deux tables à 256 slots, maps de propriétaires et CAS | Deux tables Delta ordinaires, une ligne par version d’un objet |
| Révisions attendues, reçus d’idempotence, restauration après suppression | Résolution déterministe des versions ; aucune promesse de CAS, de rejeu métier ou d’annulation |
| Import d’un ancien favori localStorage | Aucun import implicite ni stockage navigateur de remplacement |

Les règles de publication, catégories et permissions métier restent dans l’application consommatrice.
Cette capability n’est pas une migration automatique du stockage IKEA. Ne pas remplacer ses tables existantes.

## Essayer localement

Après `npm ci`, lancer une démo sur un port libre :

```bash
APP_MODE=demo USER_STATE_ENABLED=true USER_STATE_ORIGIN=http://127.0.0.1:3100 \
  npm run dev -- --hostname 127.0.0.1 --port 3100
```

Ouvrir `/saved-analyses/example`, choisir une région et une période, puis enregistrer.
Dans `/saved-analyses`, modifier le nom ou la note, ouvrir l’analyse, ou confirmer sa suppression.
« Mes réglages » enregistre la période par défaut et le tri. Les liens avec une période explicite restent prioritaires.
Le tri porte sur les éléments chargés ; « Charger plus » récupère la page suivante de 50 éléments.

La démo utilise une identité fixe et une mémoire partagée entre les routes du processus local. Elle perd ses données
au redémarrage. Elle est autorisée seulement avec `NODE_ENV=development|test`, sans `DATABRICKS_APP_NAME`, et une
origine loopback explicite. Un runtime Databricks ou un serveur de production ne peut pas sélectionner cette mémoire.

## Préparer le datamart de développement

Initialiser d’abord l’app avec `init-app`. Son projet doit appartenir à `config/data-projects.json` :
`dev-dtm-operating`, `dev-dtm-media-pm`, `dev-dtm-myvaliuz` ou `dev-dtm-insight-sharing`.

```bash
npm run user-state:init -- --schema my_app_user_state
npm run data:access:check
```

Cette commande reste locale. Elle déclare les deux tables dans `config/data-access.json`, génère le SQL sous
`migrations/user-state/001_tables.generated.sql` et actualise `resources/data-access.generated.yml`.
Elle ne lance ni SQL, ni grants, ni déploiement. Une nouvelle exécution ne change pas de schema implicitement.

Exemple de déclaration après initialisation dans `dev-dtm-media-pm` :

```json
{
  "project": "dev-dtm-media-pm",
  "sources": [],
  "personalState": {
    "analyses": "dev-dtm-media-pm.my_app_user_state.saved_analyses_v1",
    "preferences": "dev-dtm-media-pm.my_app_user_state.user_preferences_v1"
  }
}
```

Les sources analytiques conservent leurs bindings `SELECT`. Seules les deux tables personnelles reçoivent un binding
Apps `MODIFY`, qui inclut `SELECT`. Aucun droit d’écriture n’est accordé au catalog ou au schema entier.
La ressource existante SQL Warehouse suffit. Aucun Job, pipeline, base transactionnelle ou service supplémentaire
n’est ajouté. Voir [les ressources tables Databricks Apps](https://docs.databricks.com/gcp/en/dev-tools/databricks-apps/tables).

Avant toute mutation distante, confirmer workspace, profil, warehouse, application, namespace, projet et schema.
Faire exécuter le SQL relu par le mainteneur, puis vérifier les colonnes et les tables Delta obtenues. Les commandes
`CREATE ... IF NOT EXISTS` ne modifient pas une table préexistante incompatible. Déployer les bindings seulement
après création des tables et validation des droits du mainteneur.

## Configuration runtime

| Variable | Usage |
| --- | --- |
| `USER_STATE_ENABLED` | `false` par défaut ; seul `true` active les pages, la navigation et les API |
| `USER_STATE_ORIGIN` | Origine exacte de l’app, sans slash final ; HTTPS obligatoire dans Databricks |
| `USER_STATE_NAMESPACE` | Namespace stable, par exemple `dev` ; obligatoire dans Databricks |
| `DATABRICKS_APP_NAME` | Fourni par Databricks Apps ; entre dans la clé d’isolation avec le namespace |

Les variables Databricks habituelles restent nécessaires. Le stockage utilise l’identité SQL de l’app, tandis que
le propriétaire est calculé à partir de `x-forwarded-user`. L’identité n’est jamais lue dans le corps ou l’URL.
Le serveur doit rester derrière le proxy Databricks Apps, sans exposition directe de son port.
Voir [les en-têtes transmis par le proxy](https://docs.databricks.com/gcp/en/dev-tools/databricks-apps/http-headers).

Configurer les trois variables dans `app.yaml`, puis activer après la recette distante. Le shell charge le flag depuis
`/api/config` au démarrage du navigateur ; le build CI ne fige pas son activation. Un changement d’app ou de namespace
isole les anciennes données ; préparer une migration explicite pour conserver leur accès.

## Tables et concurrence

Les deux tables partagent sept colonnes simples :

| Colonne | Type | Contenu |
| --- | --- | --- |
| `app_id` | STRING | Nom de l’app et namespace |
| `owner_id` | STRING | SHA-256 de l’app et de l’identifiant proxy ; pseudonyme, pas anonymisation |
| `entity_id` | STRING | UUID d’analyse ou clé `settings` |
| `version_id` | STRING | UUID produit côté serveur à chaque mutation |
| `updated_at` | STRING | Date UTC ISO 8601, toujours au format milliseconde produit par le serveur |
| `deleted` | BOOLEAN | Marqueur de suppression |
| `payload_json` | STRING | Objet validé et versionné, ou `{}` pour une suppression |

Chaque mutation ajoute une ligne. La lecture choisit le maximum de `(updated_at, version_id)` pour une clé logique.
Elle filtre d’abord l’app et le propriétaire, puis classe les versions, puis retire les suppressions.
Ainsi, deux créations concurrentes n’exigent aucune contrainte d’unicité physique : une seule version est affichée.
Les clés primaires Delta sont informatives et ne suffisent pas à garantir cette unicité ; voir
[les contraintes Databricks](https://docs.databricks.com/gcp/en/tables/constraints).

Deux éditions simultanées du même objet utilisent la règle du dernier horodatage serveur ; en cas d’égalité,
l’UUID départage les versions. Il ne s’agit pas de l’ordre des commits. Synchroniser les horloges des réplicas.
Une édition tardive peut remplacer une édition ou une suppression concurrente. La préférence est un document complet,
sans fusion champ par champ. Employer le protocole CAS d’une app spécialisée si ce compromis n’est pas acceptable.

L’identifiant de l’analyse reste stable après un échec d’enregistrement dans le formulaire. Il évite de créer deux
objets visibles lors d’une nouvelle tentative. Ce mécanisme ne promet pas un traitement métier « exactement une fois ».
Les éventuels rejeux identiques du driver conservent les mêmes paramètres de version. Une erreur réseau peut survenir
après un commit : le serveur renvoie une erreur et l’utilisateur doit recharger avant de décider d’écrire à nouveau.

Les lectures sont paginées par UUID, avec 51 lignes maximum pour détecter la page suivante. La pagination n’est pas
un instantané : recharger pour voir les créations concurrentes dont l’UUID précède le curseur. Les requêtes utilisent
le timeout SQL central. Les succès et les erreurs portent `Cache-Control: private, no-store`. Les écritures exigent
un JSON de même origine. Le parseur AppKit borne le corps décodé à 64 Kio ; la feature borne le JSON sérialisé
à 16 Kio. Les espaces de mise en forme ne comptent pas dans cette seconde limite. Les erreurs du parseur et
des schémas gardent les en-têtes privés et l’enveloppe publique sûre.

## Brancher une vue métier

1. Étendre `definitionSchema` dans `src/features/user-state/contract.ts` avec une variante stricte et versionnée.
2. Adapter `analysisHref` avec un chemin interne connu et des paramètres validés. Ne pas accepter une URL libre.
3. Composer `SaveAnalysisButton` avec les filtres réellement appliqués à la vue. Utiliser une `key` qui change avec eux.
4. Relire les données et vérifier les droits actuels dans le service de cette vue à chaque ouverture.
5. Étendre `preferencesSchema`, ses valeurs par défaut et le formulaire ; ajouter une migration de lecture pour les versions précédentes.

```tsx
import { SaveAnalysisButton } from "@/features/user-state";

<SaveAnalysisButton
  key={JSON.stringify(appliedDefinition)}
  definition={appliedDefinition}
  suggestedTitle="Mon analyse"
/>
```

Les métadonnées de propriété restent exclusivement côté serveur. Ne pas brancher directement `GenieChat.onSave`
ou `onPin` sur ces tables : ces callbacks peuvent contenir des résultats OBO. Construire une définition validée
qui pourra être réexécutée avec les droits du lecteur.

## API

| Route | Méthode | Contrat |
| --- | --- | --- |
| `/api/saved-analyses?cursor=<uuid>` | GET | `{items, nextCursor}` |
| `/api/saved-analyses/<uuid>` | GET | Analyse courante du propriétaire ; 404 identique pour absente ou étrangère |
| `/api/saved-analyses/<uuid>` | PUT | `{title, note, definition}` ; crée ou remplace l’objet personnel |
| `/api/saved-analyses/<uuid>` | DELETE | Corps JSON `{}` ; ajoute un marqueur de suppression |
| `/api/user-preferences` | GET | Préférence courante ou valeurs par défaut, sans écriture |
| `/api/user-preferences` | PUT | Document complet `preferencesSchema` |

Les erreurs utilisent l’enveloppe `withApiRoute`. Une définition inconnue ou une nouvelle version non prise en
charge ne déclenche aucun repli silencieux. Les logs portent les noms de requêtes et les requestId, jamais les payloads.

## Exploitation, rétention et recette

Ce stockage vise les faibles volumes de préférences et d’analyses d’une app interne. Les écritures ajoutent des versions
et peuvent réveiller le warehouse. Une limite de lignes retournées ne borne pas les octets scannés. Suivre la taille des
tables et la latence avant d’en étendre l’usage. Il n’y a ni quota de collection ni purge automatique dans cette version.

Choisir une durée de conservation avec le responsable du datamart. Pour compacter les versions, suspendre les écritures,
conserver la version gagnante de chaque `(app_id, owner_id, entity_id)`, y compris les suppressions, puis vérifier les
comptages avant reprise. Ne jamais purger des marqueurs de suppression alors que des versions antérieures subsistent.
Un effacement utilisateur complet doit couvrir toutes ses versions, les deux tables et la rétention Delta/time travel.
Le hash d’identité ne dispense pas de cette politique. Ces opérations restent des mutations opérateur distinctes.

Avant activation distante, vérifier avec deux utilisateurs réels :

- créer, modifier, lire après redémarrage et supprimer une analyse ;
- conserver les préférences entre navigateurs du même utilisateur ;
- refuser la lecture/suppression des UUID de l’autre utilisateur et une requête sans identité ;
- vérifier deux premières écritures concurrentes et deux éditions du même objet ;
- refuser une origine étrangère, puis contrôler l’absence de payload dans les logs ;
- vérifier `SELECT` sur les sources et `SELECT`/`MODIFY` seulement sur les tables personnelles.

`/health` reste superficiel. Le readiness analytique ne prouve pas la capacité d’écriture personnelle.
La CI et la démo ne constituent pas une recette Databricks. Désactiver avec `USER_STATE_ENABLED=false` pour revenir
en arrière, sans supprimer de table. Ne pas réactiver une version incapable de lire des payloads déjà enregistrés.
