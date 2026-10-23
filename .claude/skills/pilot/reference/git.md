# Git et GitHub — branches, release, la PR, le verrou

_Lu par `run`, `fix` et `sync`, et par `init` qui pose les gabarits du dépôt._

## Branches

- `main` est la branche de travail de tous les projets : les branches de feature en partent
  et y reviennent par PR ; l'environnement de développement la déploie.
- Nom de branche : `feature/<CODE>-<n° première tâche>-<slug>`, `fix/<CODE>-<n>-<slug>`,
  `chore/<CODE>-<n>-<slug>`. Le code Linear dans le nom, c'est ce qui fait avancer les
  statuts de tâche sans personne.
- **Une branche par étape de cadrage**, même quand l'étape n'écrit aucun fichier :
  `prd/<slug-du-projet>` pour `init`, `roadmap/<CLE>` pour `roadmap`,
  `cadrage/<id de la feature>-<slug>` pour `feature` (cadrage et découpage, par exemple
  `cadrage/P-ABC-4-authentification`). Elle s'ouvre au début de l'étape. Ce qu'elle écrit
  (PRD, `CONTEXT.md`, barème) part en PR comme le reste ; une étape qui n'écrit que dans
  Linear laisse une branche vide, supprimée en fin d'étape (`git branch -d`).
  _Pourquoi : chaque requête de Claude enregistre la branche courante. C'est le seul repère
  qui permet au relevé de coûts (`cout-agents.py --projet`) de ranger le cadrage par étape
  et par feature ; sans lui, tout ce qui se fait sur `main` tombe dans « hors méthode »._
- `next`, `sync` et les conversations libres restent sur `main`.
- **Release.** Dès qu'un environnement porte des utilisateurs (testeurs, clients), le projet
  déclare `Release : release` dans sa section Pilot. La branche `release` ne reçoit que des
  PR `main → release`, titrées `Release <AAAA-MM-JJ>`, mergées par l'humain, sans fiche
  Linear ; les environnements de recette puis de production la déploient. Correctif urgent :
  branche depuis `release`, PR vers `release`, puis report sur `main`. Sans ligne `Release`,
  le projet n'a qu'une branche.

## La PR

- **Une PR par livraison** (jalon), titrée `<CODE>-<n> <titre de la livraison>`. Tâche
  isolée : `<CODE>-<n> <titre>`.
- **La description raconte la livraison, jamais les fiches** (Linear les déplie déjà sous
  la description). **Deux niveaux** : l'humain décide du merge en lisant le premier ; s'il ne
  peut pas le reformuler, il ne peut pas juger. Le second sert au relecteur. Dans l'ordre :
  - ligne d'ancrage `**Feature « <nom> »** — livraison <n>/<total> « <titre> »` (absente
    pour une tâche isolée) ;
  - `## Ce qui change` : d'abord ce que l'utilisateur voit, ou « rien de visible », en une
    phrase ; puis **une puce par apport**, ouverte par une phrase en gras, avec un exemple
    concret dès que l'idée est abstraite. Mots courants seulement : ni nom de fichier, ni
    variable, ni vocabulaire de la boucle (« contrat 3 », « fixtures », « mode X ») ;
  - `## Ce qui est prouvé` : du constaté, en mots courants (tests passés, recette jouée, cas
    vérifiés sur une vraie base) ; des faits, pas des cases à cocher ;
  - `## Limites connues` : ce que la livraison ne fait pas, la dette assumée, souvent les
    livraisons suivantes ;
  - ligne `Recette : [UAT.md#<feature>](<lien sur la branche>), section « Livraison <n> »`
    quand le projet tient un cahier de recette ;
  - bloc replié `<details><summary>Détails techniques</summary>` : **Comment** (fichiers et
    fonctions nommés, choix faits et écartés, par où relire, une idée par puce) et **Preuve**
    (sortie réelle, CI, capture si l'interface change). Le jargon ne vit que là ;
  - dernière ligne `Closes <CODE>-a, <CODE>-b, …`, toutes les tâches de la livraison.
- **Le lien vers la fiche n'est pas écrit dans la PR** : l'intégration GitHub de Linear le
  publie en commentaire, si l'option est active (`init`, étape 11).
## Les gabarits du dépôt

Posés par `init`, s'ils manquent :
- `.github/PULL_REQUEST_TEMPLATE.md` au gabarit de PR ci-dessus (codes du projet), pré-rempli
  par GitHub pour les PR ouvertes à la main ;
- `.github/ISSUE_TEMPLATE/config.yml`, qui neutralise les issues GitHub et renvoie vers
  Linear :
  `blank_issues_enabled: false` + `contact_links: [{name: "Les tâches se suivent dans
  Linear", url: "<url de la team>/all", about: "Aucune issue GitHub sur ce projet."}]`
  (le suffixe `/all` ouvre directement la liste des tâches, pas l'accueil de la team).

## Le merge est humain

Claude ouvre la PR avec le rapport d'audit et s'arrête. Le hook `tools/verrou-git/verrou-git.py`
refuse avant exécution tout push vers `main`, `master` ou `release`, tout push forcé et tout
`gh pr merge` ; un refus n'est pas une panne, c'est le signal de pousser sa branche par son
nom et d'ouvrir la PR. Un conflit au merge se résout sur demande de l'humain avec la skill
`resolving-merge-conflicts`.
