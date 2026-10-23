# Linear — l'outil : MCP, API, workspaces, initiatives, frise

_Lu avant d'appeler Linear pour autre chose que lire ou créer une fiche simple. Ce que le_
_MCP ne sait pas faire, et ce que l'interface ne montre pas comme on croit._

## Quotidien par le MCP, structure par le script

- **Quotidien** (features, tâches, statuts, commentaires, documents) : les outils MCP
  `mcp__<connexion>__*` (`save_project`, `save_issue`, `list_issues`, `list_projects`,
  `get_team`, `list_issue_statuses`, `save_comment`, `save_document`…). `<connexion>` est le
  nom donné dans la section Pilot du projet (`linear` par défaut). Les fiches d'agent
  écrivent `mcp__linear__*` ; `install.sh` les réécrit au nom de cette connexion. Après un
  changement de connexion, relancer `install.sh`.
- **Structure** (team, statuts, labels, templates, automatisation PR, archivage) : le script
  `scripts/init_team.py`, qui appelle l'API GraphQL avec la clé du workspace. Le MCP ne
  sait ni faire ces opérations, ni créer ou colorer une initiative.
- Tout le reste passe par le MCP : statut de feature = `save_project` → `state` (le nom du
  statut, ex. « En revue ») ; dates = `save_project` → `startDate` / `targetDate` ; date de
  jalon = `save_milestone` → `targetDate`.
- En GraphQL direct, `projectCreate` limite `description` à 255 caractères : le corps long
  (template Feature) va dans `content`.
- Un collaborateur qui n'a que `/mcp` (pas de clé) peut donc jouer `feature`, `next`,
  `fix`, `sync` ; seule `init` (et les initiatives de `roadmap`) exige la clé.

## Workspaces

Un workspace par compte ou par client. Pour chacun : une connexion MCP nommée
`linear-<slug>` (`claude mcp add -s user -t http linear-<slug> https://mcp.linear.app/mcp`,
puis `/mcp` pour s'authentifier avec le bon compte) et une clé API dans
`~/.config/pilot/linear-<slug>.env` (`save-key.sh <slug>`). Tous les scripts acceptent
`--workspace <slug>` (ou `LINEAR_WORKSPACE=<slug>`). La section Pilot du projet nomme la
connexion et le fichier de clé : c'est là qu'on les lit, à chaque fois. Chaque workspace a
son propre quota gratuit (2 teams). Une connexion MCP est authentifiée sur un seul workspace
à la fois : si la team du projet est introuvable ou vide, `get_workspace` dit lequel est
connecté ; s'arrêter et demander `/mcp` sur la bonne connexion, sans travailler sans Linear.

## Initiatives (les « caps »)

- Si le cadrage définit des versions ou des thèmes, `roadmap` crée une initiative par
  version ou thème (API `initiativeCreate`) et y rattache les features (`save_project` →
  `setInitiatives`). La roadmap se lit alors à deux niveaux : initiatives (mois), features
  (jours). Un projet à une seule version n'a pas d'initiative.
- `roadmap` et `sync` posent sur chaque initiative la date cible de sa dernière feature
  (`initiativeUpdate` → `targetDate`).
- Les initiatives sont au niveau **workspace**, pas team : supprimer une team laisse ses
  initiatives orphelines, à supprimer explicitement (`initiativeDelete`). Les nommer sans
  ambiguïté entre projets d'un même workspace (préfixer du nom du produit si besoin).

## Relations

- Entre tâches : API `issueRelationCreate`, type `blocks`.
- Entre features : API `projectRelationCreate` (`projectId` + `anchorType: "start"`,
  `relatedProjectId` + `relatedAnchorType: "end"`, `type: "dependency"`, seule valeur
  acceptée) ; la relation se dessine sur la frise.
- Quand poser une relation : `fiches.md` § Dépendances.

## Icônes et couleurs

- `roadmap` pose sur chaque initiative une couleur de la palette, dans l'ordre des
  versions : `#4ea7fc` bleu, `#f2994a` orange, `#27ae60` vert, `#eb5757` rouge, `#26b5ce`
  turquoise, `#8a6cf0` violet (teintes éloignées, distinctes en thème sombre), et une
  icône. Chaque feature prend **la couleur de son initiative** et une icône selon son thème
  (`save_project` → `color`, `icon` ; `initiativeUpdate` par l'API).
- Noms d'icônes acceptés par l'API (vérifiés) : Rocket, Sun, Bolt, Heart, Lock, Users,
  Book, Euro, Dollar, Calendar, Home, Chart, Dashboard, Automation, Shield, CreditCard,
  Bank, Briefcase, Folder, Database. Refusés : Flag, Document, Globe, Target, Star, Mail,
  Key, Settings.
- La couleur ne teinte que l'icône et les listes : **l'intérieur des barres de la frise
  n'est pas paramétrable** (gris, partie faite plus foncée). Ne pas le promettre.

## Lire la frise

- Vue à deux niveaux : Projects → Display → Timeline → Group by Initiative (la page
  Initiatives est une liste).
- Sur la frise, les barres sont blanches et seul le pourcentage change ; le statut se lit
  dans la colonne de gauche (Display → Properties → Status : coche = Terminée, cercle
  pointillé = Planifiée). Pour séparer nettement : Display → Grouping → Status, ou
  Display → Completed projects → None pour sortir le terminé de la frise. `init` le rappelle
  dans ses étapes manuelles.
