# Suivre — `next`, `fix`, `sync`, `benchmark`

_Détail des commandes de suivi : savoir où on en est, traiter une tâche isolée,_
_réconcilier après un merge, produire le barème initial._
_Règles communes : `fiches.md` (priorités, dates, vérification à l'échelle), `git.md` (la PR)._

---

## `next` — proposer l'étape logique

`next` ne fait rien de lui-même : il lit Linear, dit où on en est, et propose la commande
suivante. On peut le taper à tout moment, y compris après une semaine d'absence.

0. **Réconciliation** (`sync`, voir plus bas).
1. Retrouver la feature en cours : « En développement » ou « En revue » s'il y en a une (on
   finit ce qu'on a commencé), sinon « Planifiée » ou « À cadrer » de priorité la plus haute
   puis de date de début la plus ancienne (Urgent posé par l'humain passe devant tout).
2. Router selon son statut :

| Statut trouvé | `next` annonce et propose |
|---|---|
| Aucune feature | « Projet sans roadmap » → `roadmap` (ou `init` si non piloté) |
| À cadrer | La feature et son résumé → `feature` (cadrage) |
| Planifiée | Les livraisons et leurs tailles → `run` |
| En développement | Les worktrees/PR en cours, ce qui manque → attendre ou relancer `run` |
| En revue | La liste des PR à lire et merger, les décisions en attente → rien à lancer |
| Terminée | Les leçons à graver → `sync` puis la feature suivante |

   Si l'utilisateur dit « tâches isolées » : la première tâche « À faire » sans feature → `fix`.
   **Une feature terminée ne termine pas son cap.** Lire les features avec leur champ
   `initiatives` (`list_projects`, `fields` qui l'inclut : c'est le cap). Quand la feature
   « Terminée » appartient à un cap, lister ses features sœurs encore ouvertes et les nommer
   dans l'état : « cap X : 2 features sur 3 terminées, reste Y (À cadrer) ». Ne jamais dire
   qu'un cap est fini sans cette liste. Le 01/10, sur un projet client, `next` a lu les features sans ce
   champ ; deux textes nommaient le cap en ne pensant qu'à deux features, et Claude a
   annoncé le cap terminé alors que sa troisième feature n'était pas cadrée.
3. **Quand la proposition est `run` ou `feature`**, la faire précéder d'une ligne : « ouvre une
   session neuve pour cette commande, ou tape `/compact` avant ». La session qui mène `run` est
   le lead : chaque rapport d'agent, chaque fiche lue reste dans son contexte. Le 15/09, une
   session a enchaîné `next`, deux tâches, un cadrage, deux runs, deux `update` et un `sync` en
   sept heures ; le lead ne pesait que 8 % des jetons du second run, mais il portait toute la
   journée avant lui.
4. S'arrêter sur la proposition. Ne lancer l'étape que sur « oui ». Rester court : l'état
   en cinq lignes, la proposition en une. Les tâches isolées en attente et les idées non
   classées se signalent en une ligne chacune, pas en paragraphe.

## `fix <description>` — tâche isolée en un geste

1. Créer la tâche (`save_issue`) : template Bug ou Tâche selon le cas, label, statut
   « À faire », sans feature. Une seule phrase d'annonce, pas de squelette.
2. Branche `fix/<CODE>-<n>-<slug>` (ou `chore/…`). Bug : d'abord le test qui reproduit
   (rouge), puis la correction (vert). Chore sans comportement : pas de test exigé.
   Bug qui ne se reproduit pas du premier essai, intermittent, ou lenteur : appelle la skill
   `diagnosing-bugs` (Skill tool) avant d'écrire quoi que ce soit ; sa phase 1 construit la
   boucle qui passe au rouge sur ce bug, et c'est elle qui devient le test.
3. PR titrée `<CODE>-<n> <titre>`, description au gabarit de `git.md`, dernière ligne
   `Closes <CODE>-<n>`. S'arrêter.
4. Suite proposée : « merge, puis `next` ». **La tâche reste « À faire » jusqu'au merge** :
   c'est l'intégration GitHub qui la ferme, et `sync` qui contrôle qu'elle l'a fait.

## `sync` — réconciliation

Pour chaque feature « En revue » de la team : retrouver la PR de sa livraison en cours
(`gh pr list --search "<CODE>-<n>"`). Si mergée et toutes les tâches de la livraison
terminées → jalon terminé (ses tâches le sont) ; s'il reste des livraisons → feature
« En développement » ; sinon → feature « Terminée ». Dans
`.pilot/calibration.md`, compléter la ligne d'historique (mergée, heures réelles = colonne
« actif » de la ligne « Par livraison » du relevé `cout-agents.py`, qui additionne tous les
agents de la livraison, corrections comprises ; jamais l'horloge : l'horloge contient les attentes de
permission et les agents en veille, et le 05/09 elle a fait passer une livraison de 81 minutes
pour 6 heures). Une durée que l'outil n'a pas mesurée s'écrit « estimée » et n'entre pas dans
la médiane. Une livraison **fusionnée** (deux livraisons du découpage produites en une) s'écrit
« fusion de n » et n'entre pas non plus dans la médiane de sa taille : elle mesure deux
livraisons collées, pas une livraison plus grosse (3.1 du projet CRM, deux L fusionnées :
2,92 h, contre 1,37 et 1,47 h pour les deux XL d'avant). Puis recalculer `feature_hours_<T>` du projet = médiane
des heures réelles de cette taille (dès 2 mesures ; sinon garder le barème global) et
`days_per_week` observé = jours avec au moins un merge / semaines depuis la première feature.
**Dates réelles** : à chaque livraison mergée, poser sur le jalon `targetDate` = date du merge
(`save_milestone`) ; quand la feature se termine, `startDate` = date de la première
branche et `targetDate` = date du dernier merge (`save_project`). Sans cela, la barre
terminée reste aux dates du plan et ses jalons flottent à côté. Recaler `startDate` /
`targetDate` des features non terminées (fenêtres plausibles), sans jamais dater une
feature avant la fin de sa bloquante, ni toucher aux features en réserve (sans dates).
La roadmap devient ainsi un historique fidèle à gauche d'aujourd'hui, une prévision à
droite.
**Recale et raconte** : ouvrir le compte-rendu de `sync` par un récit court —
(a) les features décalées et la nouvelle fin de plan ; (b) la **marge restante** si la
section Pilot déclare une ligne `Échéance :` (marge négative → le dire en termes de
périmètre : « il faut choisir quoi couper », pas seulement « ça glisse ») ; (c) les
**alertes** : toute tâche isolée non terminée dont l'échéance (`dueDate`) est passée, en
soulignant les tâches-décisions citées dans des fiches de features (« la décision X a
n jours de retard, m features en dépendent »).
**Apprendre** : quand une feature passe « Terminée », relire les rapports d'audit de ses PR.
Chaque défaut trouvé par le `verifier` qui pourrait se reproduire devient une ligne dans la
section « Idiomes de code » du `CLAUDE.md` du projet (proposée, validée par l'humain, poussée
avec la PR suivante) ; **chaque remarque visuelle faite au merge** — un espacement, un libellé,
une couleur, un ordre de colonnes — devient de la même façon une ligne de la section « Idiomes
d'interface », à côté. Le premier écran d'un projet est moyen ; le dixième ressemble au produit
parce que ces lignes se sont accumulées. Un retour visuel qu'on ne grave pas se refait à chaque
livraison ; chaque décision tranchée au merge est gravée dans la section
« Décisions produit » de la fiche feature, et devient en plus une ADR (`docs/adr/`, format
et trois conditions dans `domaine.md`) quand elle est dure à inverser, surprenante sans
contexte et issue d'un vrai arbitrage ; les idées hors périmètre deviennent des tâches
isolées.
Pour ne pas se limiter aux fautes de code, relire les rapports avec sept questions (reprises
de la skill `retro`) : l'agent a-t-il mis longtemps à **trouver** un fichier (un repère de
navigation manque dans `CLAUDE.md`) ; une faute aurait-elle été **attrapée par un outil**
(lint, typeur, test, à ajouter plutôt qu'une consigne) ; le `verifier` a-t-il **laissé
passer** quelque chose (un idiome à ajouter ou à clarifier) ; une consigne du `CLAUDE.md`
**ne change-t-elle rien** au comportement (à retirer) ; un appel d'outil a-t-il **coûté**
disproportionnément (à raccourcir) ; une **information** a-t-elle manqué à l'agent (journal
du serveur, accès en lecture à un service) ; une décision a-t-elle été **réinventée** faute
d'ADR. Feature → « Rétro faite ». Supprimer les worktrees de la feature
(`git worktree remove`).
**Le temps de la feature, pas seulement celui des runs.** Quand la feature passe « Terminée »,
écrire sous le tableau des livraisons de `.pilot/calibration.md` une ligne par feature, en
heures d'horloge :

| Feature | Calendrier (jours) | Cadrage | Runs | Attente de merge | Le reste |
|---|---|---|---|---|---|

Calendrier : du lancement de `feature` au dernier merge. Cadrage : la durée notée par
`feature` à sa fin. Runs : la somme des horloges de run déjà écrites par livraison. Attente de
merge : pour chaque PR de livraison, de son ouverture à son merge (`gh pr view <n> --json
createdAt,mergedAt`). Le reste : calendrier moins les trois autres, soit les jours sans
session, la méthode, les tâches isolées. Puis une phrase qui compare à la feature précédente :
quelle colonne a grossi. Les runs ne mesurent que la production ; le 16/09, les heures
d'agents par livraison étaient stables depuis dix jours alors que chaque feature prenait plus
de jours que la précédente, et rien ne disait où passait le temps.
**Les tâches isolées aussi.** `sync` ne regarde pas que les features : lister les tâches de la
team sans feature, encore ouvertes, et chercher leur PR (`gh pr list --search "<CODE>-<n>"`).
PR mergée et tâche ouverte → la passer « Terminée » et joindre l'URL de la PR (`save_issue`,
champ `links`). Une tâche isolée n'a personne pour la fermer : le producteur d'une livraison
pose lui-même le statut de ses tâches, `fix` ne le fait pas — il compte sur l'intégration
GitHub. Quand celle-ci tombe, les fiches restent ouvertes sans que rien ne le signale.

**Contrôler que Linear voit encore GitHub.** Sur une tâche de la livraison qu'on vient de
réconcilier, `get_issue` doit montrer sa PR en pièce jointe (`attachments`). Si la liste est
vide alors que la PR est mergée, **l'intégration ne voit plus ce dépôt** : le lien vers la fiche
ne s'affiche plus dans les PR, et les statuts de tâche ne bougent que parce que les agents les
posent à la main. Le dire dans le compte rendu, avec le chemin exact : Linear → Settings →
Integrations → GitHub → Connected organizations, ajouter l'organisation du dépôt. C'est
arrivé le 04/09 sur le sandbox, un mois après son `init` : le dépôt avait changé de
propriétaire, et rien ne l'avait signalé.

Les modifications de `.pilot/calibration.md` ne font **pas** de PR à part : elles partent
dans la PR de la livraison suivante (ou de la prochaine tâche isolée).
Suite proposée : `next`.

## `benchmark` — produire le barème initial

1. Proposer 2 ou 3 dépôts représentatifs (développés avec Claude Code, assez de PR mergées).
   Attendre validation.
2. `python3 .claude/skills/pilot/scripts/benchmark.py owner/repo … --out ~/.config/pilot/calibration.md`
3. Montrer le tableau. Copier dans `.pilot/calibration.md` du projet courant s'il est piloté.

## `update` — mettre la méthode de ce projet à jour

La méthode de ce projet est une copie, dans `.claude/`. La version de référence vit dans le
dépôt `pilot`. Cette commande apporte ici ce qui a changé là-bas.

1. **Refuser si une livraison est en cours** — une branche `feature/…` non mergée, un worktree
   ouvert. Un agent lancé avec les anciennes fiches finirait avec les nouvelles. Dire ce qui
   bloque et proposer d'attendre le merge.
2. Noter la version actuelle : la ligne « Version » de `.claude/METHODE.md`.
3. Dans le clone de la méthode, `pilot` ou `pilot-method` (demander où il est si on ne le sait pas) :
   `git pull && ./install.sh <racine de ce projet>`
4. `git diff --stat .claude/` : montrer ce qui a bougé. Lire les fichiers modifiés et **dire en
   trois lignes ce qui change pour le travail** — une règle nouvelle, une consigne retirée. Un
   diff de 200 lignes que personne ne lit vaut une mise à jour non faite.
5. Commit `chore: update the pilot method to <nouvelle version>`, avec ces trois lignes dans le
   corps. Il part dans la PR en cours, ou dans une PR à lui si le dépôt est propre.

Suite proposée : `next`.

---
