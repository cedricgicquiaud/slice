# `roadmap` — poser toutes les features du projet

| Quand | Il lit | Il produit | Il s'arrête sur |
|---|---|---|---|
| Après `init`, ou quand le cadrage change | PRD, spec, README, plan validé, backlog existant | Les features et leurs livraisons dans Linear, datées ; `.pilot/design/PROMPT.md` si demandé | La validation de la liste, puis le système de design |

Relançable : ne propose que les features nouvelles.

---

## Proposer

Ouvrir la branche `roadmap/<CLE>` avant de lire le cadrage (`git.md` § Branches).

1. Lire le cadrage disponible (PRD, spec, README, plan validé, backlog existant).
2. Proposer **la liste complète des features** (grandes fonctionnalités, échelle semaines) et,
   pour chacune, **ses livraisons** (titre-résultat + taille S/M/L/XL) et l'ordre suggéré ;
   si la feature ne peut pas commencer avant une autre, une ligne « dépend de » (test de
   l'inversion : `fiches.md` § Dépendances).
   Signaler ce qui existe déjà dans Linear. **Ne rien créer.**
   On ne découpe pas en tâches à ce stade : le découpage complet d'une feature se fait à son
   ouverture (`feature` / `next`), jamais avant, jamais par morceaux.
3. Lancer l'agent `contradicteur` sur la liste proposée : ce qui manque, ce qui se contredit,
   ce qu'on ne saura pas vérifier.
   Si la roadmap engage plusieurs mois : proposer à l'humain de basculer sa session (`/model`)
   sur le modèle le plus capable le temps de la poser.
4. Dialoguer : fusions, coupes, rejets, réordonnancement.
5. **ARRÊT — attendre « validé ».**

## Créer et dater

6. Créer chaque feature (`save_project`), dans l'ordre : team du projet, statut « À cadrer »,
   description au template Feature (avec la liste des livraisons), label `Taille`, priorité
   selon `fiches.md`. Puis ses livraisons (`save_milestone`, ou API `projectMilestoneCreate`,
   `sortOrder` = rang). **Aucune tâche.**
   Initiatives seulement si le cadrage définit des versions ; icône et couleur par initiative
   (`linear.md` § Icônes et couleurs).
7. **Dater les livraisons** avec `schedule.py` (annexe A), dans l'ordre validé : non
   terminées seulement, feature en cours d'abord. Poser `targetDate` sur chaque jalon,
   `startDate` / `targetDate` sur chaque feature (première / dernière livraison).
   Ce sont des fenêtres plausibles, pas des promesses : le dire.
   Contrainte : une feature n'est jamais datée avant la fin de sa bloquante.
   Sans barème : laisser vide et proposer `benchmark`.
8. **Poser les dépendances** : celles retenues par le test de l'inversion figuraient dans la
   liste validée (ligne « dépend de ») ; les poser (`projectRelationCreate`). Les décisions et
   accès externes deviennent des tâches isolées avec échéance, citées dans les fiches des
   features conditionnées (règles « Dépendances » et « Scénario retenu »).
9. Compter et montrer le lien vers la roadmap.

## Le système de design

10. **Si `.pilot/design.md` existe et que l'humain veut un système** : écrire
    `.pilot/design/PROMPT.md`, prêt à coller dans un outil de maquettage (contenu : annexe B).
    **Demander des briques, pas des écrans** : tokens, composants, et trois ou quatre
    écrans-types qui montrent comment ils s'assemblent. Un système sert justement à ne pas
    maquetter chaque écran : les producteurs composeront avec ces briques.
    _Pourquoi maintenant : c'est le seul moment où l'on sait à la fois ce que le produit fait,
    à quoi il doit ressembler, et quelles familles d'écrans la roadmap suppose._
    S'il n'en veut pas, ne pas insister : un projet sans système de design est un projet où
    les agents décident du rendu, et où le `verifier` et le `testeur` n'ont rien à comparer.
    Le dire une fois, passer à l'étape 12.
11. **ARRÊT — l'humain maquette de son côté** et dépose le résultat dans `.pilot/design/`.
12. Suite proposée : `feature <première de l'ordre validé>` (cadrage).

---

## Annexe A — `schedule.py`

```
python3 .claude/skills/pilot/scripts/schedule.py --calibration .pilot/calibration.md \
  --start <prochain jour actif> "Livraison:S" "Livraison:M" …
```

Il lit `feature_hours_<T>` (= heures par livraison de taille T), `feature_overhead_hours`,
`hours_per_active_day`, `days_per_week` et enchaîne les livraisons sur les jours actifs.

## Annexe B — Le contenu de `.pilot/design/PROMPT.md`

- le produit et ses utilisateurs en trois lignes ;
- la direction visuelle en toutes lettres (références, ce qui est imposé, registre) ;
- **les familles d'écrans déduites de la roadmap**, jamais la liste exhaustive — « une liste
  filtrable », « un formulaire de création », « un tableau de bord », « une page publique sans
  session » ;
- la demande explicite d'un fichier de tokens séparé, en variables CSS, thème clair et
  sombre ;
- les contraintes qui se voient à l'écran (mobile d'abord, bibliothèque imposée).
