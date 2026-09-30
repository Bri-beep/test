# Partage facultatif d’une comparaison

Préconditions : serveur AppKit local en mode démo, page `/visualizations`, aucune connexion Databricks.
La comparaison de commandes autorise explicitement le partage des périodes et du segment synthétique.

- Appliquer des périodes personnalisées et le filtre Web. Ouvrir « Partager cette analyse » au clavier.
- Vérifier que le lien conserve seulement l’origine, le chemin et une définition versionnée dans le fragment.
  Aucun résultat, requête SQL, jeton ou paramètre arbitraire de l’URL ne doit être transmis.
- Vérifier la synthèse : mesure, valeurs affichées, périodes réellement appliquées, segment, écart, source,
  réserves éventuelles, caractère synthétique et date de consultation distincte de la fraîcheur des données.
- Copier le lien et la synthèse. Ouvrir le lien dans une nouvelle page et vérifier la restauration des contrôles,
  une nouvelle requête de comparaison et les mêmes totaux synthétiques.
- Vérifier que les modifications non appliquées, le chargement et une erreur empêchent le partage.
  Une ancienne réponse retardée ne doit pas remplacer la nouvelle définition partageable.
- Ouvrir un fragment malformé, une clé de comparaison inconnue ou un champ non autorisé. Afficher une erreur
  explicite sans lancer une comparaison par défaut. Une action utilisateur peut démarrer une nouvelle comparaison.
- Vérifier qu’une ancre ordinaire conserve le chargement habituel.
- Refuser l’accès au presse-papiers : conserver les textes lisibles, sélectionnables et un secours de copie manuelle.
- Vérifier le clavier, le thème sombre et l’absence de débordement mobile du panneau de partage.
- Vérifier l’absence de stockage navigateur et d’écriture vers les API d’analyses personnelles pendant le partage.

Les interceptions réseau servent seulement à provoquer une attente, une erreur ou une réponse tardive.
Les totaux proviennent de la fixture de comparaison réelle. Aucune pause arbitraire n’est nécessaire.

Hors périmètre : publication distante, envoi Slack/email, droits Databricks réels et stabilité des données métier.
Le lien transmet une définition ; son ouverture recalcule les données avec les accès habituels de l’app.
