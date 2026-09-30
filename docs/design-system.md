# Design system Valiuz pour les apps analytics

Ce guide traduit l'essentiel des **Valiuz Brand Guidelines 2026** en règles adaptées aux dashboards, cockpits et outils
internes. Il complète la charte : il ne remplace ni les médias officiels ni leurs règles d'usage.

## Principes

1. Faire passer l'information avant la décoration : beaucoup d'espace blanc, une hiérarchie courte et peu d'effets.
2. Utiliser l'orange pour guider l'attention, pas pour colorer tout l'écran.
3. Réserver le gradient Valiuz au logo et à de petits accents structurels. Ne jamais l'appliquer à du texte.
4. Donner un sens stable aux couleurs de données et accompagner la couleur d'un libellé, d'une icône ou d'une valeur.
5. Concevoir chaque état : vide, chargement, succès, erreur, données partielles et absence de permission.

## Tokens de référence

| Token | Valeur | Usage |
| --- | --- | --- |
| Encre | `#212222` | texte, contours et CTA sombres |
| Orange primaire | `#FF9D00` | action principale, métrique critique, accent actif |
| Corail secondaire | `#FF494A` | erreur, alerte ou évolution négative |
| Gradient | `#F75A55` → `#F88033` → `#F2BB06` | logo, ligne ou forme décorative ponctuelle |
| Vert data | `#58B89C` | évolution positive |
| Violet data | `#835CB7` | série de données |
| Ardoise data | `#627C89` | série de données |
| Gris data | `#B5BFC1` | série secondaire ou contexte |
| Tracés | `--chart-brand`, `--chart-positive`, `--chart-negative`, `--chart-purple`, `--chart-slate`, `--chart-neutral` | séries et carte, avec une valeur propre à chaque thème |
| Grille | `--chart-grid` | grille des graphiques et piste des jauges |
| Focus | `--focus-ring` | contour visible des boutons, liens et champs |

Les couleurs étendues sont des couleurs de visualisation, pas des couleurs de marque pour les titres ou le logo. Les
fonds et bordures neutres du shell sont des adaptations UI destinées à préserver le contraste. Les composants de
visualisation utilisent les tokens `--chart-*`, dont les valeurs diffèrent des couleurs de marque.

## Thèmes et surfaces

`src/client/globals.css` définit les tokens sémantiques des thèmes clair et sombre. `tailwind.config.ts` expose les tons de
tracé avec les noms `chart-brand`, `chart-positive`, `chart-negative`, `chart-purple`, `chart-slate` et
`chart-neutral`. Utiliser ces noms dans les composants. Ne pas coder une couleur de thème directement dans une classe.

Le panneau de partage utilise le `Dialog` AppKit avec les classes de surface et de texte Valiuz.
Ses classes explicites adaptent le composant aux thèmes de l'app.
Le tableau `content` de `tailwind.config.ts` inclut aussi `./node_modules/@databricks/appkit-ui/dist/react/ui/dialog.js` pour générer les classes du fond modal.
Lors d'une migration, ajouter cette entrée sans remplacer les autres chemins, le thème ou les plugins personnalisés.

Le token `--focus-ring` définit le contour global des boutons, liens et champs. La portée `brand-header-surface`
redéfinit aussi ce token pour conserver son contraste sur le fond clair.

`ThemeToggle` propose les choix clair, système et sombre. Il conserve le choix dans `localStorage` avec la clé
`analytics-theme`. Le script HTML applique un choix explicite avant le premier rendu React. Le choix système laisse la requête média
`prefers-color-scheme` piloter les tokens.

Le header porte toujours la classe `brand-header-surface`. Cette classe maintient un fond clair, même avec le thème
sombre. Cette contrainte protège le contraste du logo officiel, qui ne possède pas de variante sombre dans le
template. Ne pas supprimer cette portée claire et ne pas filtrer le SVG.

`DataCard` utilise une bordure fine, un rayon de 24 px et l’ombre `shadow-panel`. Sa variante `glass` utilise
`surface-glass` et un flou discret. L’ombre `shadow-floating` reste réservée aux éléments actifs et aux infobulles.

## Typographie

- Utiliser **Outfit**, auto-hébergée par l'application, pour le shell et les écrans métier.
- Réserver `800–900` aux titres courts, `600–700` aux libellés importants et `300–400` au corps de texte.
- Employer Inter, Roboto ou une police système très lisible pour une table ou un graphique exceptionnellement dense.
- Garder Caveat hors des données et des longs textes ; elle n'est pertinente que pour une annotation éditoriale courte.

## Logo et identité

- Utiliser `public/valiuz-logo-icon.svg` sur fond clair et conserver ses proportions.
- Afficher l'icône à au moins 45 px en numérique, avec une zone libre autour.
- Ne pas enfermer le logo dans une carte, ne pas ajouter d'ombre et ne pas recolorer son SVG.
- Sur fond sombre, utiliser un média officiel prévu pour fond sombre plutôt qu'un filtre CSS.

## API des visualisations

Importer l’API publique depuis `@/components/data-visualization`. Les sous-dossiers restent disponibles pour le code
interne, mais le point d’entrée public stabilise les imports des features.

| Composant | Contrat principal |
| --- | --- |
| `DataCard` | Titre, description, action, variante `solid` ou `glass`, densité et interaction facultative |
| `BigNumberKPI` | Valeur, format `Intl`, tendance et variante `plain`, `sparkline` ou `gauge` |
| `Sparkline` / `MiniAreaChart` | Points `{ label?, value }`, ton, hauteur, point final et infobulle facultatifs |
| `CircularProgress` / `Gauge` | Valeur bornée, maximum, épaisseur, ton et badge de statut |
| `MultiMetricCard` | Grille de deux ou trois colonnes avec tendances, statuts, mini-barres ou sparklines |
| `TimeSeriesChart` | Séries multiples, formats d’axe sérialisables, KPI, légende interactive, infobulle et tableau |
| `WaterfallChart` | Référence, contributions signées, total final, résidu explicite et tableau complet ; mesures additives uniquement |
| `AnalyticsMap` | GeoJSON, format numérique sérialisable, repères, projection, zoom et couche de chaleur facultative |

Les types publics incluent `DataTone`, `DataTrend`, `NumberFormat`, `AxisValueFormat`, `SparklinePoint` et les types de
propriétés. `NumberFormat` décrit les options de `Intl.NumberFormat`. `AxisValueFormat` décrit un texte, un nombre ou
une date avec des options `Intl`.

La feature facultative [PeriodComparison](period-comparison.md) compose sélecteur, KPI, séries et waterfall.
Les deux graphiques adaptent la largeur de leur axe numérique aux montants affichés.

Ces formats sont sérialisables entre les APIs et React. `TimeSeriesChart` les reçoit avec `valueFormat`,
`xFormat` et `tooltipLabelFormat`. `AnalyticsMap` reçoit `valueFormat`. L’API publique ne déclare aucune prop de
callback.

`formatNumber` et `formatAxisValue` appliquent ces contrats. Elles utilisent un résultat de repli si `Intl` refuse le
format. `formatSignedPercent` formate les tendances. `formatNumber` et `formatSignedPercent` produisent un tiret pour
une valeur non finie.

Les composants qui affichent des données acceptent le même état discriminé :

```ts
type VisualizationState =
  | { status: "ready" }
  | { status: "loading"; label?: string }
  | { status: "empty"; title?: string; message?: string }
  | { status: "error"; title?: string; message: string };
```

`READY_VISUALIZATION_STATE` fournit l’état par défaut. Une collection vide produit aussi un état vide pour les
sparklines, les cartes multi-métriques, les séries temporelles et les cartes géographiques.

`DataTrend` sépare la direction visuelle du sentiment métier. Une baisse peut donc rester positive, par exemple pour
un taux de retour. Fournir toujours `comparisonLabel` afin que le lecteur connaisse la référence temporelle.

## Composants et interactions

- Une action principale par zone. L'orange primaire porte un texte `#212222` pour rester lisible ; éviter le texte blanc
  sur orange.
- Les zones cliquables font au moins 44 px de haut et possèdent un focus clavier visible.
- La navigation indique uniquement la page réellement active avec `aria-current="page"`.
- Les animations restent courtes et respectent `prefers-reduced-motion`.
- Les messages techniques restent côté serveur. L'interface donne une action suivante et, si disponible, une référence
  partageable au support.
- Les légendes interactives utilisent `aria-pressed`. Elles conservent toujours au moins une série visible.
- Les jauges utilisent `role="meter"` et exposent leurs bornes, leur valeur et leur statut.
- Les infobulles complètent la visualisation. Elles ne remplacent jamais un libellé ou une valeur accessible.
- Les graphiques temporels montrent un tableau repliable par défaut. La carte fournit le même accès tabulaire.
- Le SVG, les contrôles de zoom et les repères de la carte acceptent le focus clavier.
- Les régions restent hors de l’ordre de tabulation. Le tableau repliable fournit leurs valeurs exactes.
- Les touches `+`, `-`, `0` et `Home` contrôlent le zoom lorsque le SVG possède le focus.
- Après un zoom, déplacer la vue avec les flèches du clavier ou en faisant glisser la carte avec un pointeur.

Framer Motion et Recharts désactivent leurs animations lorsque l’utilisateur demande moins de mouvement. La règle CSS
globale réduit aussi les transitions restantes. Ne pas ajouter une animation qui contourne ces deux protections.

## Data visualisation

- Préférer les graphiques 2D simples, les axes explicites, les unités visibles et les comparaisons directes.
- Utiliser les tokens `--chart-*` pour les tracés. Garder le ton positif, négatif ou principal stable pour un même KPI.
- Éviter les ombres inutiles, la 3D, les doubles axes ambigus et les gradients sur plusieurs séries.
- Ne jamais encoder une information uniquement par la couleur. Ajouter signe, libellé, motif ou annotation accessible.
- Afficher la définition du KPI, sa période, sa fraîcheur et sa source à proximité ou dans une aide contextuelle.

`Sparkline` et les séries de type zone appliquent un dégradé léger du ton choisi vers la transparence. Limiter ce
remplissage à une série principale afin de conserver la lisibilité.

`AnalyticsMap` dessine un SVG avec D3 Geo et une `FeatureCollection` GeoJSON fournie par l’appelant. Elle ne dépend
d’aucun service cartographique. Elle ne charge aucune tuile, ne demande aucun token et ne fait aucun appel réseau au
runtime. Le mode `heatmap` ajoute des halos aux repères. Il ne remplace pas une couche géostatistique calculée.

La page `/visualizations` charge des données synthétiques via `/api/visualizations`.
Le module serveur `visualization-demo.ts` convertit l’atlas TopoJSON embarqué par `world-atlas` en GeoJSON.
Cette page ne lit aucune source Databricks.

## Expérience conversationnelle Genie

`GenieChat` utilise les surfaces, les bordures et les ombres du système Valiuz. L’orange indique l’action principale.
Les statuts techniques utilisent des tons neutres. Une erreur utilise le corail et donne une action suivante.

La barre de question reste visible à la fin du fil. Son libellé accessible décrit le Space actif. La touche Entrée
envoie la question. La combinaison Maj+Entrée ajoute une ligne.

Le suivi montre des étapes courtes comme « Analyse de la question » et « Exécution de la requête ». Ne pas montrer le
raisonnement interne du modèle. `aria-live` annonce uniquement les changements de statut utiles.

Une réponse utilise du Markdown sans HTML brut. Une image distante devient un texte alternatif inerte. Un lien reste
actif uniquement pour HTTP(S), un chemin de même origine qui commence par un seul `/` ou un fragment `#`. Les tables
conservent les en-têtes, les légendes et le défilement horizontal. Le composant choisit `BigNumberKPI` pour une valeur
unique. Il choisit un graphique uniquement lorsque le schéma fournit une dimension et une mesure compatibles.

L’action « Arrêter le suivi » décrit une action locale. Elle ne confirme pas une annulation Databricks. Après cette
action, l’interface explique que le traitement peut continuer et exige une nouvelle conversation avant un autre envoi.
Après l’envoi du `POST`, une erreur ambiguë ne propose pas de rejeu, même sans accusé de création. Cette règle évite un
doublon si la réponse réseau est perdue.

Le SQL généré reste replié par défaut. Les actions de copie, d’épinglage et de sauvegarde ont un nom accessible. Une
confirmation visuelle ne dépend jamais uniquement de la couleur.

Les transitions utilisent l’opacité et les transformations. Elles restent courtes et ne bloquent aucune action. Le
mode `prefers-reduced-motion` supprime la révélation progressive, les déplacements et les animations de statut.

Une carte épinglée conserve sa provenance. Son aperçu peut contenir des données gouvernées. Un stockage privé doit
rester lié à l’utilisateur. Une composition partagée relit les données avec l’identité de chaque lecteur.

## Checklist d'une nouvelle page

- Le titre répond à la décision que l'utilisateur doit prendre.
- Le KPI principal est identifiable en quelques secondes.
- Les filtres ont des valeurs initiales compréhensibles et peuvent être réinitialisés.
- Les états vide, chargement, erreur et absence d'accès sont testés.
- Le clavier, le mobile et un zoom à 200 % restent utilisables.
- Les couleurs et formats d'un même KPI sont stables sur toutes les pages.
- Le mode sombre et le mode `prefers-reduced-motion` sont examinés avant la livraison.
- Un tableau ou un texte donne les valeurs exactes lorsque le graphique ne suffit pas.
