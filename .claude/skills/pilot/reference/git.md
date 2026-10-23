# Git et GitHub — branches, release, la PR, le verrou

_Lu par `run`, `fix` et `sync`, et par `init` qui pose les gabarits du dépôt._

## Branches

- `main` est la branche de travail de tous les projets : les branches de feature en partent
  et y reviennent par PR ; l'environnement de développement la déploie.
- Nom de branche : `feature/<CODE>-<n° première tâche>-<slug>`, `fix/<CODE>-<n>-<slug>`,
  `chore/<CODE>-<n>-<slug>`. Le code Linear dans le nom, c'est ce qui fait avancer les
  statuts de tâche sans personne.
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
  la description). Dans l'ordre :
  - ligne d'ancrage `**Feature « <nom> »** — livraison <n>/<total> « <titre> »` (absente
    pour une tâche isolée) ;
  - `## Ce qui change` : fonctionnel, lisible par un non-développeur, **une puce par
    changement**, une phrase chacune ;
  - `## Comment` : pour le relecteur, fichiers et fonctions nommés, choix faits et écartés,
    par où relire, **une idée par puce** ;
  - `## Preuve` : du constaté, CI verte, sortie réelle, capture si l'interface change ;
    des faits, pas des cases à cocher ;
  - `## Hors périmètre / risques` : souvent, les livraisons suivantes ;
  - dernière ligne `Closes <CODE>-a, <CODE>-b, …`, toutes les tâches de la livraison.
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
