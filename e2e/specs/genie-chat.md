# Parcours Genie conversationnel

## Préconditions

- L’application utilise le mode `demo`.
- Le navigateur ouvre la page `/genie` sans identifiants Databricks.
- Le serveur utilise uniquement les données synthétiques de la fixture Genie.

## Parcours principal

1. Ouvrir la démonstration Genie.
2. Modifier la région et la période du tableau de bord.
3. Envoyer une question depuis la vue intégrée.
4. Observer les états de réflexion et d’exécution de la requête.
5. Examiner la réponse, le tableau, la visualisation et le SQL généré.
6. Épingler le résultat dans le tableau de bord.
7. Ouvrir l’historique, puis poser une question de suivi dans la même conversation.
8. Vérifier que l’historique se ferme et reste indisponible pendant le flux.
9. Démarrer une nouvelle conversation.

## Assertions observables

- Les puces de contexte montrent les filtres actifs.
- Le champ de question reste accessible au clavier.
- Les états de traitement ont un libellé accessible.
- La réponse contient du texte, des données structurées et un SQL repliable.
- Le résultat épinglé apparaît dans la zone du tableau de bord.
- La question de suivi conserve la conversation active.
- L’historique ouvert se ferme au début du flux. Ses actions restent désactivées jusqu’à la fin.
- La nouvelle conversation efface le fil actif.

## État alternatif

Une interception ciblée renvoie une erreur de permission. L’interface explique l’action suivante et conserve la question.

## Variante d’affichage

Le parcours mobile utilise le thème sombre et le mouvement réduit. Il vérifie la saisie multiligne, la réponse finale
et l’absence de débordement horizontal de la page.

## Hors périmètre

- Les appels au workspace Databricks.
- Le consentement OAuth réel.
- Les droits Unity Catalog du Space de test.
- La persistance partagée des cartes épinglées.

## Contrat 2.0 et interruptions

Les événements suivent les champs AppKit : `message_result` précède ses `query_result`.
Simuler une fermeture du flux après le message annonçant une pièce jointe, avant ses lignes.
Vérifier que la réponse reste en erreur, que l'ancienne conversation est verrouillée et qu'un seul POST a été envoyé.
Un refus HTTP avant le flux affiche une explication française sans rejouer la question ; le flux conserve les codes et request IDs sûrs.
