# Genie dans le template 2.0

En mode Databricks, le service utilise le plugin Genie GA d’AppKit et sa méthode programmatique `sendMessage`.
Le chat reste le composant Valiuz. Le mode démo est synthétique et ne contacte aucun workspace.

```text
GenieChat → route validée → identité OBO + quota → service
  → AppKit Genie.sendMessage → client de compatibilité lié à la requête → API Databricks
```

## Responsabilités et limites

AppKit orchestre le flux, les statuts et la récupération des pièces jointes après la fin du message.
Le service projette les événements sur les champs AppKit : statuts, message final, puis résultats des pièces jointes.
Il ajoute les métadonnées de limite et d’erreur sûres, et retire les identifiants de ressource inutiles au navigateur.
Il ne conserve ni l’ancienne enveloppe `data` générale ni un tampon pour réordonner la réponse.
La configuration du plugin et ses ressources proviennent de `config/genie-spaces.json`.
Ses routes génériques sont désactivées. Seules les routes Valiuz valident les entrées et les identités.

AppKit 0.76.1 ne propage pas l’annulation à tous ses appels et journalise les erreurs reçues du SDK.
[Le client de compatibilité](../src/features/genie/server/appkit-client.ts) conserve donc un client par requête et un petit adaptateur de compatibilité :

- un seul POST, sans reprise ni basculement automatique après une erreur ;
- délais HTTP de 30 secondes et délai global de dix minutes, annulation du suivi et des appels locaux ;
- cinq reprises maximum par lecture transitoire, avec délai progressif, jitter et `Retry-After` borné ;
- erreurs nettoyées avant leur passage dans AppKit et enveloppe publique avec `requestId` ;
- validation Zod, valeurs exactes au format AppKit `string | null` avec types de colonnes, 500 lignes maximum et troncature explicite ;
- lecture des pièces jointes sans `statementId`, que cette version d’AppKit ignore.

Les credentials restent dans le client lié à la requête. Le client de service ne peut pas effectuer un appel Genie
hors de ce contexte. Aucun cache de résultat n’est activé. Les données temporaires sont libérées à la fin du flux.
Les quotas restent de huit flux par processus et deux par utilisateur, configurables avec les variables existantes.
Fermer le suivi ne garantit pas l’annulation du traitement dans Databricks. Après un envoi ambigu, démarrer une nouvelle conversation.

Le [registre de compatibilité](../config/appkit-compatibility.json) fixe les critères de retrait du client de compatibilité.
Une mise à jour ne remplace pas automatiquement ce client. La migration n’est pas un fork du plugin AppKit.

## Identité et interface

`GET /api/genie/:alias/session` expose un libellé d’identité validé, sans jeton, avec `private, no-store` sur succès et erreur.
Dans Databricks Apps, l’identité et le jeton OBO sont obligatoires. Aucun fallback service principal n’est permis.
En local, le libellé distingue le profil OAuth et le jeton local. La démo indique l’absence de connexion.
Un contrôle d’identité indisponible reste visible ; chaque envoi contrôle à nouveau l’identité et les accès.

`GenieChat` conserve le français, les thèmes, le SQL inspectable, les tableaux exacts, l’historique en mémoire et l’épinglage.
Les conversations restent dans la session du navigateur, sans plafond ni éviction automatique ; le bouton d’historique permet de les effacer.
Il accepte désormais `initialQuestion`, une question initiale modifiable, sans envoi automatique.
Les réponses rappellent de vérifier les sources et les définitions avant partage.
Le bouton d’exploration utilise `Button` d’AppKit UI avec les styles Valiuz.
Le transport navigateur utilise `connectSSE` d’AppKit UI avec `maxRetries: 0` ; le parseur SSE local a été supprimé.
La validation Zod refuse un flux inconnu ou incomplet. Le client attend toutes les pièces jointes avant une continuation.
Le hook complet amont conserve des reprises de POST et ne propose pas le contexte ni l’interruption nécessaires.
Le chat Valiuz reste utile pour le français, l’épinglage et les restrictions du rendu Markdown. Une adoption du composant
complet devra réduire le code local et passer ces tests, sans reproduire son comportement dans une nouvelle couche.

Avant l’ouverture du flux, `connectSSE` 0.76.1 expose seulement le statut HTTP. L’interface affiche un message sûr
adapté à ce statut ; elle n’accède pas au détail ni au `requestId` du corps d’erreur HTTP. L’API et ses logs conservent
cet identifiant. Les erreurs reçues dans le SSE conservent leur code, leur caractère rejouable et leur `requestId`.
Le client n’effectue aucun second appel pour lire une erreur ou retrouver une réponse.

## Explorer un écart

L’option est désactivée par défaut. Pour une comparaison et un Space compatibles :

```tsx
<PeriodComparison
  endpoint="/api/ventes/comparison"
  genie={{ alias: "sales", context: { activeTables: ["dev-dtm-media-pm.analytics.ventes"] } }}
/>
```

Cet exemple suppose que l’application a créé cette API et déclaré sa source. Le template n’ajoute aucune source métier.
Le bouton « Explorer cet écart avec Genie » apparaît pour un écart calculable. Il est désactivé pendant une modification
non appliquée. Il ouvre le contexte et une question préremplie ; l’utilisateur choisit quand l’envoyer.
Le contexte contient les deux périodes inclusives, les filtres, la mesure, l’unité, l’agrégation, les valeurs et les réserves.
Le navigateur fournit ces observations ; Genie doit les vérifier avec ses données autorisées.
Les séries détaillées et les contributions ne sont pas envoyées. Aucune causalité n’est présumée.

Le panneau peut épingler huit cartes en mémoire. Appliquer une nouvelle comparaison ou recharger la page les efface.
Ni les résultats ni ce contexte enrichi ne sont écrits dans les tables personnelles ou le stockage du navigateur.
Dans `/visualizations`, ce parcours reste disponible uniquement en mode démo : des observations synthétiques ne sont
pas envoyées à un Space réel. La réponse de démonstration reprend les deux valeurs et indique qu’aucune requête n’a été exécutée.

## Parcours de création et recette

Demander à l’agent :

> Utilise create-analytics-dbx-app pour ajouter Genie à mon app. Réutilise mes KPI et mes sources, prépare le choix
> du Space et des questions de référence, puis teste une démo où je peux explorer un écart et épingler une réponse.

`app next` ajoute une revue « Space et qualité des réponses Genie » lorsque la spec sélectionne Genie.
Le [skill local](../.agents/skills/create-analytics-dbx-app/references/genie.md) complète les skills Databricks installés hors du repository.
Il guide le besoin, les sources, le Space, ses définitions, l’interface et la comparaison avec des calculs validés.
Les skills ne s’exécutent pas pendant une conversation utilisateur.

Avant adoption réelle, tester des questions de référence avec deux identités : total, ventilation, filtre, comparaison,
période vide et demande hors périmètre. Vérifier SQL, unité, calendrier, exclusions et refus d’accès.
Les tests locaux n’attestent pas la qualité d’un Space ni ses droits réels. Création, modification, grants et déploiement
restent soumis à une autorisation couvrant leurs cibles.

Documentation amont : [plugin Genie](https://developers.databricks.com/docs/appkit/v0/plugins/genie).
