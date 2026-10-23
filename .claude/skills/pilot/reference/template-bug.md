## Reproduction

_Le scénario exact, rejouable par quelqu'un d'autre. Partir d'un état connu, donner les valeurs._
_« Depuis un compte neuf » vaut mieux que « depuis l'écran des factures »._

1. _Créer une facture vide._
2. _Ajouter une ligne : quantité 1,5 — prix unitaire 10,00 €._
3. _Enregistrer._

## Attendu

_« Le total affiche 18,00 € : 15,00 € plus 20 % de TVA. »_

## Obtenu

_Ce qui se passe vraiment, avec le message d'erreur ou la capture s'il y en a._
_« Le total affiche 15,00 €. La ligne de TVA n'apparaît pas. »_

## Terminé quand

- [ ] _Le scénario ci-dessus donne 18,00 €._
- [ ] _Un test rejoue ce scénario. **Il échouait avant la correction** — sinon il ne prouve rien,_
      _et l'historique doit le montrer : commit `test:` avant commit `fix:`._
