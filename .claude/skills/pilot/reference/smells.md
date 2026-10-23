# Les douze odeurs de code — ce que c'est, comment corriger

_Lu par le `verifier` quand il lit le diff (section « Le code »). La liste de Fowler_
_(Refactoring, ch. 3) reprise de la skill `code-review` de Matt Pocock (1.2.3)._

Deux règles la tiennent :

- **Les idiomes du projet priment.** Ce que le `CLAUDE.md` du projet demande ou tolère
  l'emporte ; une odeur qu'il endosse ne se remonte pas.
- **Toujours un jugement, jamais une faute.** Chaque odeur s'écrit « possible Feature
  Envy », avec le fichier et la ligne, et se classe « À considérer » sauf quand elle cache un
  comportement cassé. Ce qu'un outil (lint, typeur) attrape déjà ne se remonte pas.

| Odeur | Ce que c'est | Comment corriger |
|---|---|---|
| **Mysterious Name** | Un nom de fonction, de variable ou de type qui ne dit pas ce qu'il fait ou contient. | Renommer ; si aucun nom honnête ne vient, la conception est floue. |
| **Duplicated Code** | La même forme de logique dans deux morceaux ou deux fichiers du diff. | Extraire la forme commune, l'appeler des deux endroits. |
| **Feature Envy** | Une méthode qui manipule plus les données d'un autre objet que les siennes. | La déplacer sur les données qu'elle envie. |
| **Data Clumps** | Les mêmes champs ou paramètres qui voyagent toujours ensemble. | Les réunir en un type, passer ce type. |
| **Primitive Obsession** | Une chaîne ou un nombre qui tient lieu d'un concept du domaine. | Donner au concept son petit type. |
| **Repeated Switches** | Le même `switch` ou la même cascade de `if` sur le même type, à plusieurs endroits. | Polymorphisme, ou une table partagée par les deux sites. |
| **Shotgun Surgery** | Un seul changement logique qui force des retouches dispersées dans beaucoup de fichiers. | Rassembler ce qui change ensemble dans un module. |
| **Divergent Change** | Un fichier modifié pour plusieurs raisons sans rapport. | Le scinder pour que chaque module change pour une seule raison. |
| **Speculative Generality** | Une abstraction, un paramètre, un point d'extension ajoutés pour un besoin que le contrat n'a pas. | Supprimer ; réinliner jusqu'à ce qu'un vrai besoin apparaisse. |
| **Message Chains** | Une navigation `a.b().c().d()` dont l'appelant ne devrait pas dépendre. | Cacher le parcours derrière une méthode du premier objet. |
| **Middle Man** | Une classe ou une fonction qui ne fait que déléguer. | La supprimer, appeler la vraie cible. |
| **Refused Bequest** | Une sous-classe qui ignore ou réécrit l'essentiel de ce qu'elle hérite. | Remplacer l'héritage par la composition. |
