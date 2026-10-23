# Le système de design, vu par les agents

_Lu par le `tdd-writer` quand sa livraison touche un écran et que `.pilot/design/` existe ;_
_par le `verifier` et le `testeur` quand ils contrôlent un écran._

`.pilot/design/` contient un fichier de **tokens** (couleurs, polices, espacements, en
variables CSS), des **composants**, et quelques **écrans-types** qui montrent comment ils
s'assemblent. C'est la seule description de ce à quoi le produit doit ressembler.

## Pour celui qui écrit l'écran

- Composer avec ces briques. Une valeur qui existe en token s'appelle par sa variable ; une
  couleur recopiée à trois endroits est la même duplication que celle que l'audit traque
  dans le code.
- Un composant existant se réutilise ; un composant manquant se construit avec les tokens et
  se signale dans le rapport.
- Un `README` livré avec le système qui demanderait de poser une question à quelqu'un ne
  change rien à la règle des agents : le point va dans le rapport, avec l'option la plus
  réversible prise en attendant.

## Sans `.pilot/design/`

L'interface la plus simple qui satisfait le contrat, et une ligne dans le rapport : rien ne
cadrait le rendu. Le `verifier` et le `testeur` n'ont alors rien à comparer, et ne remontent
rien sur les valeurs écrites en dur.

## Pour celui qui contrôle l'écran

Une couleur, une police, un espacement écrits en dur alors qu'une variable existe : à
signaler, fichier et ligne. Un écran qui ne ressemble pas aux écrans-types : à décrire, en
nommant l'écran-type le plus proche.
