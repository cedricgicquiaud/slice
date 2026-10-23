# Les fiches Linear — comment elles s'écrivent et se planifient

_Lu par `roadmap`, `feature`, `fix`, `next` et `sync` avant de créer, dater ou trier une_
_fiche. Les appels d'API sont dans `linear.md` ; les branches et la PR dans `git.md`._

## Le moule

- **Titre court** : 5 à 6 mots, 45 caractères au plus, sans phrase ni verbe conjugué
  (« Case à cocher par tâche », « Export CSV », « Écran d'inscription »). Le résultat
  vérifiable va dans « Terminé quand », pas dans le titre.
- **Titre de feature = un résultat**, compréhensible par un non-développeur qui n'a lu
  aucun document (« L'agent connaît l'entreprise », pas « Contexte entreprise » ; « L'application en
  ligne », pas « Staging »). Le nom du chantier technique va dans la description, sous
  « Repères techniques ». Même règle pour les jalons.
- **Description en trois temps**, selon le template (`template-feature.md`,
  `template-tache.md`, `template-bug.md`).
- **« Terminé quand » = des constats observables propres à cette fiche**, en cases à cocher
  (« l'URL répond », « changer une valeur change le résultat »). Une phrase vraie de
  n'importe quelle feature (« toutes les livraisons sont mergées ») n'y a pas sa place.

Même moule pour les features, les livraisons et les tâches.

## Feature

- Elle se juge à sa durée sur la roadmap : **au moins une semaine calendaire** avec la
  capacité du projet (barème × jours actifs par semaine). En dessous, c'est une livraison, à
  fusionner dans une feature voisine. Sur un petit projet, une seule feature pour tout le
  MVP est normal. Plus de 6 livraisons : couper.
- Elle porte un label **Taille** (S ≤ 1 h, M ≤ 3 h, L ≤ 8 h, XL au-delà, en heures de
  barème), somme de ses livraisons, justifié en une ligne, corrigeable.

## Livraison

- Une livraison = une PR. Elle porte une taille S / M / L / XL : nombre de tâches (S ≤ 2,
  M 3–4, L 5–7, XL > 7), zones touchées, nouveauté, dépendances externes.
- **Un jalon seulement quand la feature demande plusieurs PR** (L, XL), ou en cours de
  route si un découpage dépasse 7 tâches. Une feature qui se livre en une PR n'a pas de
  jalon : ses tâches lui sont rattachées directement.

## Tâche

- Une tâche = un résultat livrable, quelques jours au plus. Trop gros : une feature ou des
  sous-tâches. Trop fin : une case à cocher dans « Terminé quand ».
- Toute tâche porte un label du groupe **Type**.

## Priorités

- `roadmap` pose **Haute (2)** sur la première feature de l'ordre validé, **Moyenne (3)** sur
  les autres de la version en cours, **Basse (4)** sur les versions suivantes.
- **Urgent (1) appartient à l'humain** : c'est sa façon de faire passer une feature devant.
- `next` choisit par priorité croissante, puis par date de début.
- Tâche isolée : bug → Haute, autre → Moyenne. Tâche de feature : pas de priorité propre,
  la feature ordonne.

## Dépendances : rares et réelles

Test de l'inversion : une relation se pose seulement si inverser l'ordre **casse**. « Juste
bizarre » est une file de passage, et les dates suffisent. Feature ↔ tâche est impossible
dans Linear : une décision à prendre ou un accès à obtenir reste une tâche isolée, citée
dans la fiche des features qu'elle conditionne. Linear signale les chevauchements mais ne
décale jamais une date de lui-même : replanifier est le travail de `sync`. Les appels :
`linear.md` § Relations.

## Dates

- **Le facteur limitant est le temps humain disponible**, pas la taille du code : avec
  Claude, une PR se livre en minutes. La roadmap se calcule en jours actifs.
- **Scénario retenu** : la frise datée montre le plan auquel on croit, y compris derrière
  une décision pas encore prise ; une feature suspendue à une décision garde ses dates.
  L'autre branche existe en **réserve** : des features sans aucune date, jamais supprimées.
  La fiche de la tâche-décision décrit les deux branches (quelles features s'annulent,
  lesquelles se datent) et porte une échéance (`dueDate`). C'est l'alerte de `sync`
  (décision en retard) qui rappelle que le plan est conditionnel.

## Après création

Compter : annoncé / créé dans Linear. Deux nombres égaux, ou une explication. Sonder une
fiche au hasard contre le moule.

## Vérification à l'échelle

- Compter aux trois endroits : annonce de Claude, Linear, GitHub (branches, PR).
- Sonder deux fiches au hasard contre le moule.
- Audit mensuel : labels sans tâche, tâches sans feature depuis plus d'un mois, features
  « En revue » sans PR, features à 100 % non terminées.
