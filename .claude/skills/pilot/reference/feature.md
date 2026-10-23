# `feature <description>` — cadrer puis découper une feature

| Quand | Il lit | Il produit | Il s'arrête sur |
|---|---|---|---|
| À l'ouverture d'une feature « À cadrer » | Sa fiche, le PRD, `CONTEXT.md`, le code concerné | Les décisions produit et le contrat de validation dans la fiche feature, puis toutes ses tâches dans Linear | Le cadrage, puis le découpage |

Deux temps, deux validations. Le cadrage dit ce qui devra être vrai ; le découpage dit qui le
fabrique et dans quel fichier.

---

## Temps 1 — cadrer

1. **Retrouver la feature** dans Linear (titre proche, statut « À cadrer »), ou en créer une
   nouvelle après validation, comme `roadmap`. Lire sa fiche, le PRD, `CONTEXT.md`, le code
   concerné.
   Pendant tout le cadrage : un mot de l'humain qui contredit le glossaire, un mot flou qui
   recouvre deux choses, ou un code qui contredit ce qu'il affirme se tranchent sur-le-champ,
   et `CONTEXT.md` se met à jour aussitôt (`domaine.md`).
2. **Poser les questions qui restent**, selon `entretien.md` : rounds numérotés, réponse
   recommandée, les faits cherchés dans le code avant de demander.
   Si une question ne peut être tranchée que par le client (ou un tiers absent) : elle ne se
   devine pas. `/to-questionnaire` écrit le document à lui envoyer, et la feature reste
   « À cadrer » jusqu'à la réponse.
3. **Proposer, sans rien créer** :
   - les **décisions produit** (choix tranchés, avec l'option retenue) ;
   - le **contrat de validation** : 10 à 30 phrases « ce qui devra être vrai », observables
     par l'utilisateur, dont au moins un tiers de refus (ce qui doit être impossible ou
     rejeté). Chaque phrase nomme un écran, une donnée ou une valeur de cette feature.
4. **Lancer l'agent `contradicteur`** sur la proposition : il rend les cas non
   prévus, les phrases invérifiables, les règles qui se contredisent et le supposé connu.
   Présenter ses questions à l'humain **avec** la proposition, sans y répondre à sa place :
   chacune se solde par « à ajouter » ou « hors périmètre ».
   _Pourquoi : c'est le seul moment où un oubli coûte encore une phrase et pas une journée. Un
   cadrage validé sans ce passage est validé à l'aveugle._
5. **ARRÊT — l'humain valide le cadrage.**
6. Écrire les deux sections dans la fiche feature (`save_project` → `content`, sections
   « Décisions produit » et « Contrat de validation » du template Feature). La feature reste
   « À cadrer ».

## Temps 2 — découper

7. **Lancer l'agent `decoupeur`** sur la feature cadrée : il propose les livraisons, les
   fichiers que chacune ouvrira, ce qui les rend indépendantes, et **les frontières dont il
   n'est pas sûr**. Son découpage est une proposition, pas une décision : le reprendre, le
   corriger si le dépôt le contredit, et soumettre les frontières incertaines à l'humain.
8. **Proposer le squelette de toute la feature, sans rien créer.** Pour chaque livraison
   (jalon) :
   - ses tâches (titre court + une ligne, label Type) ;
   - **les fichiers qu'elle touche** (code et fichier de tests, disjoints de ceux des autres
     livraisons) ;
   - **les phrases du contrat qu'elle couvre** (par numéro).

   Une feature sans jalon = une seule livraison implicite. Les règles de coupe des tâches :
   annexe A.
9. **Vérifier le squelette** :
   - chaque phrase du contrat a une livraison ;
   - chaque règle de chaque décision produit est la case d'une tâche et d'une seule ;
   - aucun fichier n'apparaît dans deux livraisons ;
   - chaque tâche a un « Terminé quand » avec au moins un constat de refus.
10. **ARRÊT — l'humain valide la liste.**
    Si le découpage a déplacé une clause du contrat ou amendé une décision produit du temps 1
    — un recoupage pour deux agents le fait presque toujours —, c'est une décision de
    l'humain : elle se grave dans la fiche feature, section « Décisions produit », avec
    « amende la décision n° X », avant de créer quoi que ce soit.
11. **Créer toutes les tâches de la feature** (`save_issue`), maintenant et pas livraison par
    livraison : Linear calcule l'avancement sur le total, qui ne redescend jamais.
    Pour chaque tâche : team, project = la feature, `milestone` = la livraison, statut
    « À faire », label, description au template Tâche, **dans l'ordre des livraisons puis des
    tâches**, `sortOrder` = rang (API `issueUpdate`).
    Dans la description de chaque jalon : ses fichiers et ses numéros de contrat (c'est ce que
    `run` recopie dans les `MISSION.md`).
12. Passer la feature « Planifiée ». Mettre le lien recette (`UAT.md#<slug>` ou Notion)
    dans la fiche feature, section « Recette » du template Feature.
13. **Compter** : annoncé / créé. Sonder une fiche au hasard contre le moule (`fiches.md`).
14. **Noter la durée du cadrage** dans `.pilot/calibration.md`, sous le nom de la feature :
    heure du lancement de `feature`, heure de la validation du découpage, nombre de questions
    posées (entretien et contradicteur). `sync` en a besoin pour la ligne de la feature.
15. Suite proposée : `run <feature>`.

---

## Annexe A — Couper les tâches

- **Les tâches se coupent par situation de l'utilisateur**, pas par couche technique :
  « Convertir un lead dont la personne existe déjà », pas « Transaction de conversion » puis
  « Fenêtre de conversion ».
- Chaque tâche porte le serveur, l'écran et les tests de sa situation.
- Son « Terminé quand » a **une case par règle observable** des décisions produit et du
  contrat, recopiée avec ses sources, et ses cas de test attendus (`template-tache.md`). Une
  règle noyée dans un paragraphe de mission se perd ; une case de ticket se vérifie.
