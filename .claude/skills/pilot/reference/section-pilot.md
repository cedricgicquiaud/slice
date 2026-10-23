## Pilot

_Configuration de ce projet. Les règles de la méthode vivent dans la skill `pilot` ; ici,_
_seulement ce qui est propre à ce dépôt._

**Posé par `init`**

- Workspace Linear : `<SLUG>` (connexion MCP `linear-<SLUG>` ; clé `~/.config/pilot/linear-<SLUG>.env`)
- Team : `<NOM>` — clé `<CODE>` — id `<TEAM_ID>`
- Agents en parallèle : `1` (livraisons produites en même temps par `run` ; monter à 2 ou 3
  quand la boucle a fait ses preuves sur ce projet)
- Barème et capacité : `.pilot/calibration.md`
- Cahier de recette : `UAT.md` à la racine, lié depuis chaque feature
- Direction visuelle : `.pilot/design.md`, système de design : `.pilot/design/` — absents si
  le produit n'a pas d'écran, ou si le rendu est laissé aux agents

**Selon le projet** — une ligne absente vaut « non », et ce qu'on perd est dit à côté

- Lancer l'app : `<commande, ex. npm run dev>` — sans elle, le `testeur` n'a pas d'écran à ouvrir
- Poste par worktree : `<ce qui change d'un worktree à l'autre, ex. .env.local du poste A :
  APP_URL=http://localhost:3001, DATABASE_URL=…/crm_a, TEST_DATABASE_URL=…/crm_test_a ;
  poste B : 3002, crm_b, crm_test_b>`, **et la recette pour rendre un poste prêt**
  (`npm ci`, `npm run db:migrate`, `npm run seed:admin -- …`) — sans elle, `Agents en
  parallèle` reste à 1 : deux worktrees se partageraient le port et la base ; sans la
  recette, le lead ne sait pas préparer un poste et le testeur photographie la page de
  connexion
- Amorce de recette : `.pilot/amorce-recette.js` — ouvre une session et pose des données ;
  sans elle, le `testeur` photographie des écrans vides
- Testeur : `passe visuelle automatisée` (défaut) | `Maestro sur simulateur` (projet mobile)
- Release : `release` — une branche stable en plus de `main` ; les PR y vont depuis `main`
- Échéance : `<AAAA-MM-JJ>` — `sync` annonce alors la marge restante à chaque réconciliation

**Le contrat de ce projet** : aucun développement sans fiche Linear ; rien n'est créé dans
Linear sans liste validée.
