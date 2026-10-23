# `init` — cadrer et déclarer un projet piloté

| Quand | Il lit | Il produit | Il s'arrête sur |
|---|---|---|---|
| Premier jour d'un projet | Le dépôt, son PRD ou son README s'il y en a | `.pilot/recherche.md`, `.pilot/PRD.md`, `.pilot/design.md`, la team Linear, la section `## Pilot`, `CONTEXT.md`, les gabarits GitHub, l'allowlist | La validation du PRD, puis celle de la direction visuelle |

**Pré-requis** :
- dépôt git avec remote GitHub ;
- clé API du workspace dans `~/.config/pilot/` (`linear.env`, ou `linear-<slug>.env` pour un
  autre workspace) ;
- connexion MCP authentifiée sur ce workspace ;
- intégration GitHub activée dans ce workspace (Settings → Integrations).

---

## Comprendre le produit

Ouvrir la branche `prd/<slug-du-projet>` avant la première question (`git.md` § Branches).

Si un cadrage existe déjà (PRD, ou README qui dise ce que le produit fait et pour qui) : le
lire et passer à l'étape 4.

1. **D'abord la recherche.** Demander en une phrase de quoi parle le produit, puis lancer la
   skill `research-assistant` sur ce sujet : ce qui existe déjà, les standards du domaine, les
   règles extérieures qui s'imposent (réglementation, formats obligatoires, obligations
   légales), ce que font les produits comparables. Le document va dans `.pilot/recherche.md`.
   _Pourquoi : au moment du PRD, personne ne sait encore rien, et une supposition posée là se
   paie sur toute la roadmap._
2. **Puis l'entretien**, informé par ce qu'on a trouvé, selon `entretien.md`.
   Trois rounds, en général : utilisateurs et problème ; périmètre et hors périmètre ;
   contraintes (stack, échéance, environnements) et versions ou thèmes s'il y en a.
   Écrire le résultat dans `.pilot/PRD.md`, une page : utilisateurs, problème, périmètre V1,
   hors périmètre, contraintes, grandes fonctionnalités pressenties.
3. **ARRÊT — l'humain valide le PRD.**
4. **La direction visuelle.** Si le produit n'a pas d'écran (bibliothèque, API, script) :
   sauter les étapes 4 et 5 et le dire.
   Trois questions, pas plus : **des produits dont tu aimes l'interface** (URL, captures
   d'écran, un nom suffit) ; **ce qui est imposé** (logo, couleurs, police, charte existante,
   bibliothèque de composants) ; **le registre** — dense et professionnel, ou aéré et grand
   public. La recherche de l'étape 1 a regardé les produits comparables : elle peut dire à
   quoi ils ressemblent.
   Écrire `.pilot/design.md` : les références avec ce qu'on leur emprunte, ce qui est imposé,
   le registre. Rien sur les écrans à ce stade — ils ne seront connus qu'après la roadmap.
   _Pourquoi : sans elle, les agents rendent l'interface que le modèle produit par défaut, et
   personne ne peut dire qu'elle est fausse._
5. **ARRÊT — l'humain valide la direction visuelle.**

## Brancher Linear

6. Demander le **workspace** (slug d'URL ; s'il y a plusieurs connexions MCP, laquelle), le
   **nom** du projet et la **clé** (3 lettres, proposer une valeur d'après le nom).
   Rappeler : plan gratuit = 2 teams par workspace.
7. Lancer `python3 .claude/skills/pilot/scripts/init_team.py --name "<nom>" --key <CLE>
   [--workspace <slug>]`. Le script est idempotent : il **adopte** une team existante portant
   cette clé et complète ce qui manque. Montrer le rapport. S'il liste des actions « MANUEL »,
   les donner à l'utilisateur avec le chemin exact dans Linear.
8. Écrire la section `## Pilot` dans le `CLAUDE.md` du projet à partir de
   `reference/section-pilot.md` (remplir workspace, nom, clé, id). Créer le fichier s'il
   n'existe pas. Ne pas toucher au reste du fichier.
9. Créer `.pilot/calibration.md` : copie du barème global `~/.config/pilot/calibration.md`
   s'il existe, sinon un barème vide et une note « lancer `/pilot benchmark` ». Créer
   `CONTEXT.md` à la racine, au format de `domaine.md`, avec les termes que le PRD vient de
   fixer (un mot par concept, les synonymes à éviter) ; pas de `docs/adr/` avant la première
   ADR.
10. **Si un second membre est prévu** : écrire `.mcp.json` à la racine (annexe C). Chaque
    membre clone, fait `/mcp` → s'authentifie avec son compte Linear. La clé API reste dans
    le `~/.config/pilot/` de chacun.

## Meubler le dépôt

11. Vérifier que le dépôt est couvert par l'intégration GitHub de Linear : demander à
    l'utilisateur de confirmer que l'organisation du dépôt apparaît dans Linear → Settings →
    Integrations → GitHub → Connected organizations. Sinon lui indiquer le bouton « + ».
    Lui faire vérifier aussi, au même endroit, que Linear commente chaque PR avec le lien de
    ses fiches (commentaire marqué `linear-linkback`) : c'est le seul lien vers la fiche
    visible depuis GitHub, la PR n'en écrit pas.
12. Poser les gabarits GitHub du dépôt, s'ils manquent : le gabarit de PR et le renvoi des
    issues vers Linear (`git.md` § Les gabarits du dépôt).
13. **Poser la base de la boucle.**
    - Les lignes `Lancer l'app :` et `Testeur :` de la section Pilot, déduites de la stack
      (annexe A), confirmées d'un mot.
    - Si `.claude/settings.json` n'a pas encore de liste `permissions.allow` : l'ajouter
      selon l'annexe B, sans toucher aux hooks posés par `install.sh` (suivi, verrou git).
    - `.pilot/MISSION.template.md`, copié depuis `reference/MISSION.template.md`, commande de
      tests adaptée.
14. Si aucun barème n'existe : proposer `benchmark`.
15. Suite proposée : `roadmap`.

---

## Annexe A — Lancer l'app et tester, selon la stack

| Stack | `Lancer l'app :` | `Testeur :` |
|---|---|---|
| Page statique | `python3 -m http.server 8765` | navigateur piloté |
| App avec serveur | sa commande de dev | navigateur piloté |
| Mobile Expo | simulateur | Maestro |

## Annexe B — L'allowlist de `.claude/settings.json`

- la commande de tests, la commande de lancement de l'app et celle de build ;
- `git status/diff/log/show/add/commit/push/branch` ;
- les lectures : `ls`, `cat`, `grep`, `find`, `head`, `tail`, `sort`, `echo` ;
- ce qu'il faut pour éteindre un serveur : `lsof`, `ps`, `kill`, `pkill`, `sleep`, `curl`
  vers l'app locale ;
- les outils MCP Linear de lecture et `save_issue` / `save_project` / `save_comment`.

**Ne jamais autoriser : la suppression de fichiers, le merge, le réseau autre que `git push`
et `curl` vers l'app locale.**

**Une commande composée n'est autorisée que si chacun de ses morceaux l'est** : un agent qui
écrit `pkill -f "next dev"; sleep 1; curl localhost:3000` attend un humain sur `sleep`, même
si `pkill` est autorisé, et personne n'est devant l'écran pour cliquer.

## Annexe C — `.mcp.json` d'un projet à plusieurs

```json
{"mcpServers": {"<connexion>": {"type": "http", "url": "https://mcp.linear.app/mcp"}}}
```
