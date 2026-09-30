# Découverte des sources Databricks

Utiliser ce parcours lorsque les tables, vues, grains, clés ou garanties de fraîcheur ne sont pas suffisamment connus
pour définir les KPI et les requêtes. Le résultat attendu est un contrat de source vérifiable, pas un export de données.

## Partir de ce qui est déjà connu

Lire `docs/product-brief.md`, la configuration serveur et les repositories existants. Distinguer les informations
confirmées, les hypothèses et les inconnues. Demander au maximum trois précisions à la fois, en privilégiant :

1. la question métier et le grain recherché ;
2. le workspace, le warehouse, le projet/catalogue et le schema autorisés ;
3. les tables ou vues candidates et leur propriétaire.

Ne pas lancer une exploration distante si les fichiers locaux, la documentation de la source ou un contrat fourni
répondent déjà à la question.

## Sécuriser l'exploration distante

Avant tout accès distant, même en lecture seule, afficher et faire confirmer :

```text
Workspace : <host>
Identité ou profil : <nom non secret>
Warehouse : <nom ou identifiant>
Projet/catalogue : <catalog>
Schema : <schema>
Objets candidats : <liste bornée>
```

Lorsque le repository fournit `npm run databricks:check`, l'exécuter d'abord pour vérifier l'identité et le périmètre
sans SQL. Utiliser ensuite le même profil pour toute exploration approuvée ; ne jamais extraire ou recopier son jeton.

Vérifier que l'identité dispose uniquement des accès nécessaires. Une exploration ne justifie ni grant, ni SQL
d'écriture, ni nouveau job, ni copie locale de résultats. Ne jamais afficher ou enregistrer un token.

## Explorer du général au précis

Consulter `databricks-data-discovery` lorsqu'il est installé. Genie One peut aider à trouver des sources ou proposer du SQL.
Son périmètre couvre les données visibles par l'identité ; une consigne de catalogue dans un prompt ne l'isole pas.
Utiliser cette voie uniquement lorsque ce périmètre entre dans l'autorisation donnée et que la sortie reste non sensible.
Sinon, conserver les contrôles explicites ci-dessous. Une source suggérée reste candidate jusqu'à validation et déclaration Valiuz.
Vérifier la commande disponible avec le CLI local ; ne pas installer un MCP pour reproduire une capacité CLI existante.

Utiliser le mécanisme de requête en lecture seule déjà disponible dans l'environnement. Préférer successivement :

1. les métadonnées `information_schema` pour inventorier un nombre borné d'objets et de colonnes ;
2. `DESCRIBE TABLE` ou son équivalent pour le schéma, le type et les propriétés d'un objet confirmé ;
3. des agrégations bornées pour compter les lignes, mesurer les valeurs nulles, estimer l'unicité et vérifier les dates ;
4. des regroupements agrégés pour détecter doublons de clés, grains mixtes ou explosions de jointure.

Valider et citer chaque partie d'un identifiant Unity Catalog avant de l'utiliser. Paramétrer toutes les valeurs de
filtre. Ne jamais transformer une saisie libre en fragment SQL. Fixer un nom de requête, un timeout et une limite de
lignes pour chaque contrôle.

Éviter les échantillons de lignes. Si un cas ne peut pas être compris sans exemple, demander une autorisation ciblée,
sélectionner uniquement des colonnes non sensibles et appliquer une limite très basse. Ne jamais copier une ligne
client dans le brief, une fixture, un prompt ou un log.

## Établir le contrat de source

Pour chaque objet retenu, consigner les champs structurés avec `data:init`, puis compléter si nécessaire le contrat
`data/contracts/<nom>.yml` avec des notes non sensibles couvrant :

```yaml
notes:
  status: Confirmé | À confirmer | Rejeté
  type: À confirmer
  timeColumnAndTimezone: À confirmer
  historyDepth: À confirmer
  knownQualityRules: À confirmer
  sensitiveFields: À confirmer
  allowedJoinsAndCardinalities: À confirmer
  evidenceAndVerificationDate: À confirmer
```

Enregistrer l'objet confirmé avec `npm run data:init -- <nom>`. Lire `data-preparation.md` pour choisir le mode : rester
en `direct` par défaut. Le script synchronise `config/data-access.json`, le contrat et les fichiers générés. Relire le
binding `SELECT` et ne pas déclarer un objet seulement exploratoire.

Comparer le grain de la source au grain du KPI. Pour chaque jointure candidate, expliciter la cardinalité attendue et
contrôler le nombre de lignes avant et après. Marquer `À confirmer` dès que la preuve est insuffisante.

## Clore la découverte

Résumer les objets retenus et rejetés, les contrôles réellement exécutés, les bindings déclarés, les limites de la
preuve et les inconnues.
Proposer ensuite une seule requête métier, bornée et testable, pour la prochaine tranche. L'exploration n'est pas une
autorisation de modifier les grants, les données ou le déploiement.
