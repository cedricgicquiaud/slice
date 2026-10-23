# L'entretien — comment poser les questions d'un cadrage

_Lu par `init` (le PRD, la direction visuelle) et `feature` (les décisions produit, le_
_contrat). Mécanique reprise de la skill `grilling` de Matt Pocock (1.2.3) : un arbre de_
_décisions, travaillé par rounds, jusqu'à ce qu'il ne reste rien de supposé en silence._

## L'arbre et la frontière

Un cadrage est un **arbre de décisions** : chaque réponse ouvre les décisions qui en
dépendent. À tout moment, la **frontière** est l'ensemble des questions qu'on peut poser
sans deviner une réponse qu'on n'a pas encore : celles dont tous les prérequis sont réglés.
Une question dont la réponse dépend d'une autre encore ouverte attend le round suivant.

## Les rounds

Poser toute la frontière en un round, jamais une question à la fois, jamais un
questionnaire de vingt lignes. Annoncer d'emblée le nombre de rounds pressentis (trois, en
général). Chaque question est numérotée, en français, et porte **ta réponse recommandée** :
l'humain accepte en un mot ou corrige.

```
**Q1 — <titre de la question>** : <la question, ses options s'il y en a>
➡️ Recommandé : <ta réponse, et pourquoi en une ligne>

**Q2 — …**
```

Chaque round de réponses redessine l'arbre : les décisions prises repoussent la frontière
et débloquent les questions qui en dépendaient. Recalculer la frontière, poser le round
suivant.

## Les faits sont ton travail, les décisions le sien

Une question dont la réponse est dans le dépôt, dans `.pilot/recherche.md` ou dans Linear
ne se pose pas à l'humain : va la chercher (un sous-agent d'exploration si c'est long), et
n'attends pas son retour pour poser le reste de la frontière ; seules les questions qui en
dépendent attendent. À l'humain, on ne pose que des **décisions**. Une décision que lui
non plus ne peut pas prendre (elle est chez le client, chez un tiers) va dans
`/to-questionnaire`, et le cadrage reste ouvert jusqu'à la réponse.

## Fini quand

La frontière est vide : chaque branche de l'arbre a été visitée, rien n'est supposé en
silence. Alors seulement, proposer le résultat (PRD, décisions produit et contrat) et
s'arrêter sur la validation. Rien n'est écrit dans Linear avant.
