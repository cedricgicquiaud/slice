# Le domaine — `CONTEXT.md` et les ADR

_Lu par `init` (qui pose `CONTEXT.md`), `feature` (qui affûte les termes au cadrage) et_
_`sync` (qui grave les décisions prises au merge). Repris de `domain-modeling` de Matt Pocock_
_(1.2.3)._

## `CONTEXT.md` : le glossaire du produit

Un fichier à la racine du dépôt, lu par les agents avant de nommer quoi que ce soit. Il ne
contient que les mots **propres à ce produit** : ni concept de programmation, ni détail
d'implémentation, ni décision. Un glossaire, rien d'autre.

```md
# <Nom du produit>

<Une ou deux phrases : ce que c'est, pour qui.>

## Vocabulaire

**Commande** :
Ce qu'un client passe pour être livré. Une commande a des lignes et un statut.
_Éviter_ : achat, transaction

**Facture** :
La demande de paiement envoyée après livraison.
_Éviter_ : note, bill
```

Règles : **être tranché** (un mot par concept, les autres sous _Éviter_) ; **définir ce que
c'est, pas ce que ça fait**, en une ou deux phrases ; grouper sous des sous-titres quand des
familles apparaissent.

`init` le crée avec les termes que le PRD vient de fixer. Ensuite il se met à jour **au
moment où un terme se tranche**, pas en lot : au cadrage d'une feature, quand l'humain
emploie un mot qui contredit le glossaire (« ton glossaire dit *cancellation* pour X, tu
sembles vouloir dire Y : lequel ? »), quand un mot flou recouvre deux choses (« *compte* :
le Client ou l'Utilisateur ? »), ou quand le code contredit ce que l'humain affirme.

## Les ADR : les décisions qu'on ne veut pas réexpliquer

Une ADR (*architecture decision record*) est un fichier `docs/adr/NNNN-<slug>.md`,
numéroté à la suite, et tient en un paragraphe :

```md
# <Titre court de la décision>

<Une à trois phrases : le contexte, ce qu'on a décidé, et pourquoi.>
```

Sections facultatives, seulement quand elles apportent : `Statut` (proposée, acceptée,
remplacée par NNNN), `Options écartées`, `Conséquences`.

**On n'écrit une ADR que si les trois conditions tiennent** :

1. **dure à inverser** : changer d'avis plus tard coûte vraiment ;
2. **surprenante sans contexte** : un lecteur futur se demandera « pourquoi ont-ils fait ça ? » ;
3. **issue d'un vrai arbitrage** : il y avait des alternatives sérieuses, et on a choisi
   pour des raisons précises.

Une seule manque : pas d'ADR. Ce qui se qualifie : la forme de l'architecture, un choix de
technologie qui engage, une frontière entre modules, un écart volontaire au chemin évident,
une contrainte invisible dans le code, une alternative rejetée pour une raison qu'on
oublierait.

Où vont les autres décisions : celles d'une feature, dans sa fiche Linear (section
« Décisions produit ») ; les idiomes, dans le `CLAUDE.md` du projet. `sync` fait le tri au
merge. `docs/adr/` se crée avec la première ADR, pas avant.
