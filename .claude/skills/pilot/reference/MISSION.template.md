# MISSION — <CODE Linear> <titre de la livraison>

_Ordre de mission d'une livraison. Copier en `MISSION.md` à la racine du worktree (fichier_
_exclu de git via `.git/info/exclude`)._

_Ce fichier ne porte que **ce qui change d'une livraison à l'autre**. La façon de travailler —_
_ordre des commits, périmètre, « tu ne tranches pas », `UAT.md`, PR, stop, format du rapport —_
_vit dans la fiche de l'agent (`.claude/agents/tdd-writer.md`), qui s'applique dans les deux_
_modes de lancement._

## Ta mission

- Feature Linear : **<nom de la feature>** — livraison <n>/<total> « <titre> »
- Tâches, dans l'ordre de production : <CODE>-a, <CODE>-b, <CODE>-c. Un producteur par
  tâche ; ta consigne de lancement dit laquelle est la tienne.
- Branche : `feature/<CODE>-<n>-<slug>` (déjà créée, tu es dessus)
- Titre de ta PR : `<CODE>-<n> <titre de la livraison>`

## Fichiers que tu modifies

_Déduits du contrat, phrase par phrase : une phrase dont aucun fichier n'est ouvert ici ne_
_pourra pas être livrée, et le producteur s'arrêtera pour le dire._

- `<fichier ou dossier 1>`
- `<fichier ou dossier 2>`
- `tests/<fichier>.test.js`
- `UAT.md` (section de cette livraison seulement)

## Décisions produit déjà prises

_Recopiées de la fiche feature. Elles sont tranchées : tu les appliques, tu ne les rediscutes pas._

- <décision 1, une ligne>
- <décision 2>

## Contrat de validation — ce que ta livraison doit rendre vrai

_Les phrases du contrat de la feature affectées à cette livraison, avec leur numéro d'origine_
_et la tâche qui la prouve. En toutes lettres : le numéro seul ne dit pas ce qu'il faut prouver._

4. <phrase du contrat> — <CODE>-a
5. <phrase du contrat> — <CODE>-b
6. <refus : ce qui doit rester impossible> — <CODE>-b

## Idiomes de ce projet

_Les règles du `CLAUDE.md` qui concernent les fichiers ci-dessus. Relis ton diff contre elles_
_avant de pousser._

- <idiome 1>
- <idiome 2>

## Cases de chaque tâche

_Le « Terminé quand » et les cas de test attendus de chaque fiche Linear, recopiés tels quels._
_C'est la liste que le `verifier` contrôle case par case._

### <CODE>-a <titre>
- [ ] <case> (<source : D16, contrat 20>)
- Cas de test attendus : <cas>

## Commande de tests

`<npm test | node --test tests/*.test.js | pytest>`
