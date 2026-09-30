---
name: github-engineer
description: Gérer le cycle de vie Git et GitHub d'une tâche avec branche ou worktree isolé, validations du repository, suivi de pull request et nettoyage prudent. Utiliser pour démarrer, publier, terminer ou nettoyer une tâche de code.
---

# Mission

Rendre chaque tâche récupérable, isolée et facile à relire. Préférer la preuve Git aux suppositions et les règles du
repository aux conventions génériques.

# Règles non négociables

- Lire tous les `AGENTS.md` applicables avant de modifier Git ou les fichiers.
- Ne jamais travailler directement sur une branche par défaut, d'intégration, de release ou protégée. Considérer
  `main`, `master`, `develop` et `staging` comme protégées sauf instruction contraire du repository.
- Ne jamais supprimer, écraser, stasher, reset, nettoyer ou déplacer un travail non commité sans autorisation explicite.
- Ne jamais utiliser `git branch -D`, forcer la suppression d'un worktree ou supprimer une branche distante sans demande
  explicite.
- Ne publier, ouvrir une pull request, fusionner ou modifier GitHub que lorsque la demande utilisateur l'autorise.
- Rester dans le worktree de la tâche et préserver les fichiers privés, ignorés, générés ou hors scope.

# Examiner le contexte

Avant chaque workflow :

1. Résoudre la racine avec `git rev-parse --show-toplevel`. S'arrêter hors d'un repository Git.
2. Inspecter `git status --short --branch`, `git remote -v`, `git branch --show-current` et
   `git worktree list --porcelain`.
3. Comparer `git rev-parse --git-dir` et `git rev-parse --git-common-dir` pour identifier un worktree lié.
4. Déterminer la branche de base dans cet ordre : choix explicite, `AGENTS.md`, convention documentée, branche par
   défaut du remote.
5. Si `gh` est disponible et authentifié, confirmer le repository, la branche par défaut et l'état de la pull request.
   Sinon, utiliser les refs Git et marquer les informations GitHub comme inconnues.

Faire un fetch du remote et de la branche de base avant d'affirmer un état distant. Si le fetch échoue, conserver le
travail local, signaler que les informations sont périmées et ne pas annoncer une branche poussée ou fusionnée.

# Démarrer une tâche

Quand l'utilisateur demande une nouvelle tâche :

1. Inspecter les worktrees et branches existants. Réutiliser uniquement un worktree dont le but et la branche
   correspondent clairement ; demander si plusieurs candidats sont plausibles.
2. Laisser tout worktree sale intact. Un checkout protégé sale n'empêche pas de créer un worktree propre séparé.
3. Dériver un sujet court en kebab-case et choisir `feat/`, `fix/`, `refactor/` ou `chore/` selon le changement.
4. Créer la branche depuis la branche de base distante à jour. Pour un worktree, choisir un dossier frère unique ; ne
   jamais l'imbriquer dans un autre checkout.
5. Vérifier la racine, la branche, la base, l'upstream et le statut propre avant l'implémentation.

Si une branche existe sans worktree, vérifier sa base, son statut et son usage avant de l'attacher. Ne jamais reset une
branche existante pour la faire correspondre artificiellement à la tâche.

# Travailler dans la tâche

- Avant chaque phase importante, vérifier racine, branche, statut et diff pertinent.
- Arrêter et signaler les modifications sans rapport au lieu de les absorber ou de les annuler.
- Stager uniquement des chemins explicites. Exclure credentials, configs locales, caches, environnements virtuels,
  builds et fichiers d'éditeur, sauf artefact intentionnellement versionné.
- Garder des commits focalisés et compréhensibles. Ne pas réécrire un historique potentiellement partagé sans demande.
- Utiliser les validations et skills spécialisés du repository au lieu de dupliquer leurs règles.

# Publier et ouvrir une pull request

Publier uniquement si l'utilisateur le demande ou si la tâche inclut explicitement cette publication :

1. Terminer les validations pertinentes et relire les commits à publier.
2. Confirmer le repository, le remote, la branche courante et la base de la pull request.
3. Rechercher une pull request existante pour le même couple head/base et la réutiliser.
4. Pousser normalement avec un upstream si nécessaire. Ne jamais forcer le push sans demande explicite après
   explication du risque d'historique partagé.
5. Créer la pull request en brouillon, sauf demande explicite d'une PR prête à relire.
6. Rapporter son URL, sa base, sa head et son état.

# Vérifier la fin de tâche

Toujours effectuer ces contrôles avant d'annoncer la fin :

1. Examiner le statut suivi et non suivi, puis les diffs staged, unstaged et relatifs à la base.
2. Exécuter `git diff --check`, lire `git log --oneline <base>..HEAD` et le diff complet `<base>...HEAD`.
3. Exécuter les tests, lint, types, builds ou validations exigés par les fichiers modifiés et `AGENTS.md`.
4. Utiliser les reviews de code et documentation applicables du repository.
5. Inspecter les chemins et contenus modifiés pour secrets, tokens, clés privées, configs locales, caches, sorties
   générées et changements hors scope. Ne jamais afficher un secret trouvé ; indiquer uniquement fichier, ligne et
   catégorie.

Ne pas committer silencieusement lorsqu'un utilisateur demande seulement un statut ou une validation. Si des changements
restent, les classer comme travail sale et les préserver.

# Classer l'état

Rapporter les drapeaux vérifiés et le plus haut état atteint :

- `DIRTY` : changements suivis, non suivis, conflictuels ou fichiers ignorés ambigus.
- `COMMITTED` : worktree propre et commits de tâche présents dans `<base>..HEAD`.
- `PUSHED` : `COMMITTED` vrai et une ref distante courante contient exactement `HEAD`.
- `PR_OPEN` : `PUSHED` vrai et GitHub confirme une pull request ouverte pour la branche.
- `MERGED` : la branche cible mise à jour contient le `HEAD` de la tâche.

Une pull request marquée fusionnée appuie le diagnostic mais ne remplace pas la preuve d'ascendance Git. Si `gh` manque
ou n'est pas authentifié, l'état de PR est inconnu, pas faux.

# Prouver qu'un nettoyage est sûr

Avant de supprimer un worktree, prouver que :

1. le chemin exact est enregistré et n'est pas le dossier courant ;
2. `git status --porcelain=v1 --untracked-files=all` est vide ;
3. les fichiers ignorés ne contiennent rien de local ou ambigu à perdre ;
4. tout travail prévu est commité et validé ;
5. le `HEAD` est contenu dans la branche distante exacte ou dans la branche cible mise à jour.

Si une preuve manque, arrêter le nettoyage et expliquer laquelle. Pour un travail fusionné, utiliser
`git worktree remove <chemin-exact>`, puis `git worktree prune` depuis un checkout conservé. Supprimer une branche locale
avec `git branch -d <branche-exacte>` uniquement lorsqu'aucun worktree ne l'utilise.

# Répondre aux workflows usuels

- **Nouvelle tâche** : préparer la branche ou le worktree, puis rapporter chemin, branche et base.
- **Statut de tâche** : rapporter racine, remote, worktree, base, propreté, avances/retards et les cinq drapeaux.
- **Fin de tâche** : exécuter les validations, classifier l'état et proposer le prochain geste sûr.
- **Nettoyage des tâches fusionnées** : lister les candidats admissibles et bloqués, puis obtenir une confirmation
  des chemins et branches exacts avant toute suppression.

# Handoff

Résumer les fichiers modifiés, validations, commits, branche, base, statut de push, pull request et état du worktree.
Ne jamais annoncer une publication, fusion ou suppression sans preuve Git ou GitHub correspondante.
