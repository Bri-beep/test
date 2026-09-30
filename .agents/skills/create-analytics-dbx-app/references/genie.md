# Accompagner une intégration Genie

Lire cette référence pour ajouter Genie, porter une conversation existante ou explorer une comparaison de périodes.
Réutiliser le brief, les sources et les KPI déjà connus. Le mainteneur n’a pas à choisir un rôle DA, AE ou DE.

## Cadrer les questions et les données

- Identifier les questions utiles et la décision attendue. Une conversation libre n’est pas nécessaire à toute app.
- Identifier les tables, le grain, les jointures, les définitions, les exclusions et le calendrier métier.
  Respecter le projet autorisé et les déclarations d’accès du template.
- Consulter `databricks-core`, puis `databricks-data-discovery` pour explorer les métadonnées autorisées.
  Les sources disponibles et leurs droits comptent davantage qu’une restriction écrite dans un prompt.
- Reprendre le Space connu. Sinon, proposer de réutiliser un Space couvrant ce périmètre, puis envisager sa création.
  Consulter la référence Genie du skill `databricks-apps` installé. Ne pas copier ou modifier ce skill amont.
  La création du Space, ses modifications et les grants restent des mutations distantes à autoriser.

## Préparer une réponse vérifiable

Conserver dans les notes de conception les définitions et les questions de référence, sans lignes sensibles.
Inclure un total connu, une ventilation, un filtre, une comparaison, une période vide et une demande hors périmètre.
Pour chaque question, préciser le calcul de référence, l’unité, le calendrier, la tolérance et le comportement attendu.
Le résultat peut être un refus ou une demande de clarification. Ne pas exiger une réponse chiffrée sans données.

Aligner les instructions du Space sur les KPI validés avec `validate-analytics-kpis`.
Préparer les changements localement avant toute mise à jour du Space.
Les tests synthétiques prouvent l’intégration, pas l’exactitude des réponses d’un Space réel.

## Intégrer dans l’app

1. Lire les docs Genie du package installé et [le contrat Valiuz](../../../../docs/genie.md).
2. Garder les alias de `config/genie-spaces.json`, leur binding et le scope OBO existants.
   Examiner le rendu des ressources avec `data:access:render` avant le déploiement.
3. Utiliser le service et le plugin privé existants. AppKit fournit `sendMessage` ; le client de compatibilité garantit
   l’identité par requête, l’envoi unique et les lectures annulables. Ne pas monter les routes Genie génériques.
4. Consulter `databricks-app-design` pour le statut, le SQL inspectable et les états vide, erreur et résultat partiel.
   Utiliser le lecteur `connectSSE` existant avec `maxRetries: 0` et les événements AppKit au premier niveau.
   Garder `GenieChat` Valiuz, son contexte, son interruption et ses callbacks d’épinglage.
   Ne pas réintroduire l’ancienne enveloppe SSE ni un parseur parallèle. Attendre le flux complet et ses pièces jointes.
   Un composant AppKit peut être adopté après vérification de ses props, des tokens et des garanties de l’interface.
5. Si une comparaison bénéficie de Genie, fournir la prop facultative `genie` à `PeriodComparison`.
   Le Space doit couvrir le KPI et ses sources. La question reste modifiable et demande un envoi explicite.
   Ne pas transmettre des valeurs d’une sélection non appliquée ni présenter une contribution comme une cause.
6. Garder les résultats, cartes et snapshots en mémoire. L’état personnel stocke uniquement les définitions autorisées.

## Vérifier et livrer

Exécuter les tests de contrat AppKit, d’isolation et le parcours navigateur. Vérifier notamment :

- OBO absent refusé, deux identités concurrentes isolées, aucun recours au service principal ;
- un POST maximum, aucun basculement automatique de transport après une erreur ;
- arrêt avant et après soumission, lectures et attente bornées, erreur sans contenu sensible ;
- 500 lignes maximum, troncature explicite et aucun lien signé exposé ;
- périodes, filtres et réserves conservés dans le contexte ; SQL inspectable et épinglage en session.

Pour la recette réelle autorisée, comparer les questions de référence aux calculs validés, avec deux utilisateurs aux droits différents.
Consigner les écarts de définition, d’accès et de résultat. Ne pas inscrire les réponses sensibles dans Git.
Terminer par l’état réellement atteint : démo testée, intégration locale testée ou recette réelle effectuée.

## Lors d’une mise à jour AppKit

Relire `config/appkit-compatibility.json`, les signatures et les tests avant de retirer une exception.
Ne pas remplacer le client simplement parce qu’un numéro de version augmente.
Le skill guide la construction ; le plugin traite les conversations au runtime.
