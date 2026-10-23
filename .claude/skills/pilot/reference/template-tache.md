## Problème

_Ce qui manque ou ce qui gêne aujourd'hui. Une ou deux phrases, compréhensibles sans lire la feature._
_« Le numéro de facture est saisi à la main : deux factures peuvent recevoir le même. »_

## Ce qu'on fait

_Le résultat visé, pas la manière de coder._
_« Générer le numéro à l'enregistrement, à partir du dernier utilisé. »_

## Terminé quand

_Des constats observables, pas des intentions. **Au moins un refus** : ce qui doit devenir_
_impossible. Une tâche sans refus n'est vérifiée qu'à moitié._

_**Une case par règle observable** que la tâche porte, recopiée en toutes lettres, ses sources_
_entre parenthèses. Une décision produit qui pose trois règles fait trois cases : un renvoi_
_« décisions 14 à 17 » laisse la troisième sans preuve. Une règle que dit aussi une phrase du_
_contrat fait une seule case, avec les deux sources (D18, contrat 28). Une énumération reste_
_une case. Les décisions techniques (table, routes, registre) ne font pas de case : le_
_`verifier` les lit dans le diff. Repère : 8 à 20 cases par tâche ; au-delà, la tâche porte_
_deux situations, coupe-la._

- [ ] _Deux factures créées à la suite reçoivent deux numéros consécutifs (contrat 4)._
- [ ] _Une facture annulée garde son numéro ; le suivant ne le réutilise pas (D6)._
- [ ] _Refus : le champ numéro n'est plus saisissable à la main (D5)._

## Cas de test attendus

_Les cas que la tâche doit prouver, un par ligne, refus compris. Le producteur peut en ajouter,_
_pas en retirer._

- _deux créations successives ; une création après annulation ; une saisie manuelle refusée_
