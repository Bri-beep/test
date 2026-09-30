# Choisir les capacités et les skills

Lire ce guide au cadrage ou lorsqu'une application reçoit un nouveau besoin.
Il relie les usages aux intégrations disponibles ; il ne donne pas d'autorisation de créer une ressource distante.

## Partir de l'action utilisateur

Reformuler l'action attendue et proposer la plus petite combinaison utile.
Exemples : suivre un chiffre → `analytics` ; poser une question sur les ventes → `genie` ; importer un document → `files`.
Une conversation sur les données ne demande pas nécessairement un agent généraliste.
Un filtre SQL ne demande pas nécessairement de recherche sémantique ou de base transactionnelle.

Consulter `npm run app:capabilities -- --all` et `docs/appkit-capabilities.md`.
Le catalogue distingue le socle intégré, les adaptateurs conservés et les intégrations optionnelles à construire.
Présenter pour chaque proposition : utilité, ressource existante à réutiliser, identité, limites et critère d'acceptation.
Réutiliser un choix utilisateur explicite ; poser une question seulement lorsqu'il reste une décision utile.

Consigner les capacités retenues dans la spec, par exemple :

```bash
npm run app:guide -- --non-interactive --type assistant --capabilities genie
npm run app:capabilities
```

Les valeurs métier déjà connues restent dans la spec. Ce choix exprime un besoin, pas une activation.
Garder `analytics` lorsqu'une app possède des KPI générés. Les capacités optionnelles passent ensuite par une tranche dédiée.
Pour une bêta, consigner la décision et le risque accepté dans le document de conception de cette tranche avant de coder.
La présence de `agents` ou `ai-search` dans la spec ne vaut pas acceptation de la bêta.

## Lire les skills au moment utile

Le socle recommandé comprend six skills. Lire uniquement ceux qui servent l'étape :

| Étape | Skill amont | Complément Valiuz |
| --- | --- | --- |
| Profil, authentification, commandes CLI | `databricks-core` | Cibles connues, profil nommé et aucun token copié |
| Runtime et intégration AppKit | `databricks-apps` | Routes de features, versions exactes, exceptions des adaptateurs |
| Écrans de données ou conversationnels | `databricks-app-design` | Design system, composants et tokens Valiuz |
| Recherche de sources ou proposition de SQL | `databricks-data-discovery` | Catalogue autorisé, métadonnées et agrégats bornés |
| SQL et warehouse | `databricks-dbsql` | KPI validé, paramètres liés et résultat Zod |
| Bundles et livraison | `databricks-dabs` | Un app.yaml, production Git-backed et préparation data séparée |

`npm run app:skills` ajoute les spécialistes pertinents : Jobs, Model Serving, Lakebase ou Vector Search.
Pour une préparation notebook/pipeline, consulter aussi `databricks-jobs` ou `databricks-pipelines` lorsqu'ils sont disponibles.
Les guides Files, Genie et Agents appartiennent aux références Apps ou aux docs du package ; ne pas inventer un skill manquant.

Examiner la présence et les empreintes des points d'entrée :

```bash
npm run app:skills -- --directory /chemin/vers/les/skills
```

La commande affiche une installation officielle ciblée. Exécuter cette installation quand elle entre dans la demande de mise en place locale.
Les skills restent hors du repository. Relancer le contrôle ensuite ; une révision différente demande une lecture, pas un changement automatique du registre.
Si un skill manque, utiliser la documentation officielle correspondant au package installé et signaler la limite.
Le cadrage, la démo et les tests locaux continuent sans accès Databricks.

## Appliquer les contrats du template

| Suggestion amont | Application dans ce template |
| --- | --- |
| Créer un nouveau scaffold AppKit | Utiliser le clone Valiuz et `init-app` ; conserver les fichiers d'une app existante |
| SQL générique par `queryKey` ou `useAnalyticsQuery` | Passer par route → service → repository → `SqlExecutor` ; ne pas monter de route générique |
| Remplacer l'UI par les composants AppKit | Réutiliser les composants Valiuz ; adopter un composant utile après correspondance des tokens et tests des états |
| Activer `genie()` et reprendre les exemples de chat | Utiliser le plugin programmatique via le service Genie ; garder le client de compatibilité et suivre [le parcours Genie](genie.md) |
| Ajouter une route d'identité ou un fallback service principal | Réutiliser `/api/genie/:alias/session` et le résolveur d'identité ; aucun fallback sans OBO |
| Choisir Lakebase pour tout état persistant | Garder l'état personnel Delta optionnel ; évaluer Lakebase pour un besoin transactionnel distinct |
| Laisser Genie One chercher parmi toutes les données visibles | Respecter le périmètre autorisé ; une restriction dans un prompt ne remplace pas un contrôle d'accès |
| Donner tous les outils disponibles à un agent | Déclarer les outils nécessaires et leur identité ; tester les refus et l'approbation des mutations |

Ces adaptations portent sur les contrats du template, pas sur les signatures des APIs amont.
Vérifier les signatures dans le package installé. Ne pas recopier les manuels amont dans les skills locaux.

## Livrer une preuve utile

- KPI : fixture synthétique, source déclarée, calcul et limites vérifiés.
- Genie : contexte, OBO, erreurs, interruption et aucune double soumission.
- Fichiers : contrat d'import, tailles, chemins et droits vérifiés.
- Modèle : entrées/sorties validées et coût borné.
- Job : paramètres autorisés, exécution unique et suivi explicite.
- Agent : outils autorisés, données non fiables traitées comme contenu et aucune action ambiguë rejouée.

Poursuivre avec `delivery.md`. L'activation de droits, le lancement d'un traitement et le déploiement gardent leurs autorisations propres.
