## Problème

_Ce qui manque ou ce qui gêne aujourd'hui, du point de vue de l'utilisateur. Une ou deux phrases._
_« L'artisan refait ses factures à la main dans un tableur, et se trompe de numéro. »_

## Ce que l'utilisateur pourra faire

_Le résultat, pas la mécanique. « Créer une facture depuis un devis et l'envoyer au client »,_
_pas « brancher le générateur de PDF sur la table des devis »._

## Livraisons

_Le découpage validé, une ligne chacune, dans l'ordre. Le titre dit un résultat constatable._

1. _Saisie des lignes — S_
2. _Numérotation — M_
3. _Export PDF — M_

## Décisions produit

_Les choix tranchés au cadrage, une ligne chacun : l'option retenue, et pourquoi._
_Complété au fil des merges, quand l'humain tranche une décision remontée par un agent._

- _Les montants circulent en centimes entiers — évite les erreurs d'arrondi en euros flottants._
- _Une facture envoyée est figée — obligation comptable._

## Contrat de validation

_Ce que les agents devront rendre vrai. C'est le détail : chaque phrase sera affectée à une_
_livraison au découpage, et le `verifier` contrôlera qu'un test la couvre._

_10 à 30 phrases, numérotées. Chacune observable par l'utilisateur, sans ambiguïté._
_Au moins un tiers de refus : ce qui doit rester impossible._
_Aucune phrase qu'on puisse rendre vraie par un raccourci — « la page charge vite » se satisfait_
_avec une page vide._

1. _Le total affiché est la somme des lignes, TVA comprise._
2. _Le numéro de facture ne se répète jamais, même sur deux créations simultanées._
3. _Refus : une facture sans aucune ligne ne peut pas être créée._
4. _Refus : une facture envoyée ne peut plus être modifiée._

## Terminé quand

_Le résumé, pour toi. Deux ou trois constats qui disent que **la feature entière** est finie —_
_pas le détail du contrat ci-dessus, qui sert aux agents pendant la production._
_Des constats propres à cette feature : « toutes les livraisons sont mergées » est vrai de_
_n'importe laquelle, donc interdit._

- [ ] _L'artisan crée une facture depuis un devis et la télécharge en PDF._
- [ ] _Un numéro déjà utilisé ne peut pas être réattribué._

## Repères techniques

_Le nom de chantier que le titre ne porte pas, et les points d'entrée dans le code._
_« Module `billing`, table `invoices`, service de PDF externe. »_

## Recette

_Lien vers le cahier de recette (`UAT.md` ou base Notion), posé quand la feature passe_
_« Planifiée »._
