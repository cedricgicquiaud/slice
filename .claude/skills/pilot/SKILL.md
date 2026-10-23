---
name: pilot
description: >-
  Pilotage de projet avec Linear (tableau de bord), GitHub (code) et Claude Code
  (exécution). Utiliser dès que l'utilisateur parle de Linear, de roadmap, de
  features ou de tâches à suivre, dit « pilotage », « prochaine feature »,
  « nouvelle feature », « tâches isolées », « pose la roadmap », « run »,
  « lance la boucle », « où en est-on », ou tape /pilot <commande>. S'applique
  aussi automatiquement dans tout projet dont le CLAUDE.md contient une
  section « ## Pilot » : avant de coder, après un cadrage, et à la livraison.
  Commandes : init, roadmap, feature, run, next, fix, sync, benchmark.
---

# Pilotage — Linear · GitHub · Claude

## Le principe

**Linear** est le tableau de bord que l'humain regarde. **GitHub** est l'atelier : il n'y va
que pour relire et merger. **Claude** est l'ouvrier : il lit son travail dans Linear, le fait
dans GitHub, met Linear à jour en chemin.

**La règle unique** : le code Linear d'une tâche (`ABC-12`) est dans le nom de la branche
et le titre de la PR. C'est ce fil qui permet à GitHub de faire avancer Linear sans personne.

## Vocabulaire

| Linear dit | On dit | Échelle | Ce que c'est |
|---|---|---|---|
| Team | **Projet** | Mois | Un dépôt, un produit. Clé à 3 lettres (`ABC`). |
| Project | **Feature** | Semaines | Une grande fonctionnalité (« Authentification »), une barre sur la roadmap, livrée en une ou plusieurs PR. Un Project Linear se dit toujours « feature ». |
| Milestone | **Livraison** | Jours | Une partie livrable d'une feature = **une PR**. Une petite feature n'a qu'une livraison. |
| Issue | **Tâche** | Heures | Une étape d'une livraison, ou une tâche isolée (bug, retouche) sans feature. |
| Initiative | Cap (facultatif) | Trimestre | Regroupement de features (une version, un thème), sur un gros projet seulement. |

Comment une fiche s'écrit, se dimensionne, se date et se priorise : `reference/fiches.md`.
Le vocabulaire du produit (`CONTEXT.md`) et ses décisions durables (ADR) : `reference/domaine.md`.

## Quand cette skill s'applique

- **Projet piloté** : le `CLAUDE.md` du projet contient une section `## Pilot`. Alors, dans
  toute conversation : après un cadrage (plan validé, README, PRD), proposer `roadmap` ;
  avant de coder, vérifier qu'une fiche Linear existe (sinon `feature` ou `fix`) ; à la
  livraison, PR titrée avec le code, tâches citées, arrêt.
- **Sans section `## Pilot`** : projet non piloté, Linear reste intact. À une commande autre
  que `init`, répondre : « Projet non piloté. Lancer `/pilot init` d'abord. »

## Les invariants

Ils tiennent quelle que soit la commande ; le détail est dans le fichier de la commande qui
les exécute.

1. **Rien n'est créé dans Linear sans liste validée** par l'humain (« validé », « ok »,
   « go »). D'abord un squelette : titres + une ligne.
2. **Le contrat de validation précède le code** : au cadrage, 10 à 30 phrases « ce qui devra
   être vrai », dont des refus ; chaque phrase affectée à une livraison, la somme couvre tout.
3. **Les livraisons sont disjointes** : jamais les mêmes fichiers, tests compris. C'est ce
   qui permet de les produire en parallèle.
4. **Pas de code sans test préalable** : le `tdd-writer` produit test rouge, code minimal,
   vert, refactor, un commit par transition ; l'historique en est la preuve.
5. **Les décisions de fond remontent** : devant un choix non couvert par sa fiche, un agent
   prend l'option la plus réversible et le signale ; l'humain tranche au merge.
6. **Une PR par livraison, et le merge est humain** : Claude ouvre la PR avec le rapport
   d'audit et s'arrête ; le verrou git refuse le reste (`reference/git.md`).
7. **Compter après chaque création** : annoncé / créé, deux nombres égaux ou une explication.

## Statuts

**Tâche** : Backlog → À faire → En cours → En revue → Terminée ; Bloquée ; Annulée.
« En cours », « En revue », « Terminée » sont posés par GitHub (commit poussé sur une branche
portant le code, PR ouverte, PR mergée) ; Claude coche aussi au fil de l'eau.

**Feature** : À cadrer → Planifiée → En développement → En revue → Terminée → Rétro faite ;
Annulée. **C'est Claude qui les pose, jamais GitHub** : « À cadrer » à la création,
« Planifiée » quand les tâches existent, « En développement » à la branche, « En revue » quand
les PR sont ouvertes et auditées, « Terminée » par réconciliation (`sync`, au début de chaque
`next`) : PR mergée et toutes les tâches terminées.

## Outils

- Linear au quotidien par le MCP `mcp__<connexion>__*`, la structure par
  `scripts/init_team.py` et la clé du workspace. **La section Pilot du projet nomme la
  connexion et la clé : les lire avant tout appel à Linear.** Une team introuvable ou une
  liste vide sur un projet piloté signale une connexion authentifiée sur un autre workspace :
  le dire et s'arrêter, sans continuer de mémoire. Limites du MCP, workspaces, initiatives,
  icônes, frise : `reference/linear.md`.
- GitHub par `gh`. Branches, release, gabarit de PR, verrou : `reference/git.md`.
- Skills voisines, par le Skill tool : `diagnosing-bugs` (un bug qui ne se reproduit pas du
  premier coup), `resolving-merge-conflicts` (un merge ou un rebase bloqué),
  `to-questionnaire` (une décision que seul le client peut prendre ; tapée par l'humain).

## Commandes

**Chaque commande s'arrête à une validation et finit en proposant la suivante.** L'humain
répond oui ou non ; `next` lit Linear et propose l'étape logique à tout moment.

**Lis le fichier de `reference/` avant d'exécuter une commande** : les étapes, les arrêts et
les gabarits y sont ; jouée d'après ce résumé, une commande saute la moitié de son travail.

### Cadrer — `reference/init.md`, `roadmap.md`, `feature.md`

| Commande | Ce qu'elle fait | Elle s'arrête sur |
|---|---|---|
| `init` | Une fois par projet : recherche du domaine, entretien, PRD, team Linear, meubles du dépôt. | La validation du PRD |
| `roadmap` | Propose toutes les features et leur ordre, relues par le `contradicteur`, puis les crée et les date. | La validation de la liste |
| `feature` | Cadrer (décisions produit et contrat, relus par le `contradicteur`), puis découper (le `decoupeur` propose des livraisons sans fichier commun). | Le cadrage, puis le découpage |

### Produire — `reference/produire.md`

| Commande | Ce qu'elle fait | Elle s'arrête sur |
|---|---|---|
| `run` | La seule qui tourne sans toi : une copie du dépôt par livraison, un `tdd-writer` dans chacune, `verifier` et `testeur` en parallèle, `correcteur` s'il faut, un rapport dans chaque PR. | Le merge, qui est humain |

### Suivre — `reference/suivre.md`

| Commande | Ce qu'elle fait | Elle s'arrête sur |
|---|---|---|
| `next` | Lit Linear, dit où on en est en cinq lignes, propose l'étape suivante. Ne fait rien. | Sa proposition |
| `fix` | Une tâche isolée en un geste : fiche, branche, test, PR. Sans la boucle. | La PR ouverte |
| `sync` | Après un merge : statuts, dates, barème, leçons d'audit dans le `CLAUDE.md` du projet. | Rien, enchaîne sur `next` |
| `benchmark` | Le barème de charge initial, à partir de dépôts existants. | La validation des dépôts |
| `update` | Met la méthode de ce projet à jour depuis le dépôt `pilot`. | Le commit, à valider |

## Le circuit en une ligne

`init` (PRD) → `roadmap` → par feature : `feature` (cadrage, contrat ; découpage disjoint)
→ `run` (tdd-writer × n, verifier + testeur, correcteur, PR) → merge humain → `sync` → `next`.
Quatre validations humaines par feature : cadrage, découpage, merge, idiomes. Entre deux,
Claude travaille seul.

## Où vit la méthode

Ce projet porte sa copie dans `.claude/`, versionnée avec lui ; `.claude/METHODE.md` dit la
version installée et comment la mettre à jour. Une amélioration se fait dans le dépôt
`pilot`, sur une branche, avec une PR.
