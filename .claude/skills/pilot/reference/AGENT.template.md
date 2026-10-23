# Gabarit d'une fiche d'agent

_Comment s'écrit une fiche d'agent de la boucle pilot (`.claude/agents/*.md`)._
_Ne concerne que les cinq agents de pilot : `tdd-writer`, `verifier`, `testeur`,_
_`decoupeur`, `contradicteur`. Les fiches venues de plugins ne suivent pas ce gabarit et_
_une mise à jour les écraserait._

Une fiche décrit **un agent**, pas une marche à suivre. Un agent se définit autant par ce
qu'il refuse de faire que par ce qu'il fait : c'est la seule partie qu'un modèle capable ne
peut pas deviner tout seul.

---

## 1. Les réglages (frontmatter)

Seuls `name` et `description` sont obligatoires. Ce qui n'est pas déclaré est hérité de la
session qui lance l'agent.

| Champ | Ce qu'il fait | Ce qu'on met |
|---|---|---|
| `name` | Identifiant. Minuscules et tirets, jamais de `:` | Le nom de l'agent |
| `description` | **Sert à choisir l'agent.** Le détail va dans le corps, pas ici | Une ou deux phrases : le métier, et le geste final |
| `tools` | Liste blanche. Tout ce qui n'y est pas est absent | Le minimum qui suffit à l'agent |
| `color` | Couleur à l'écran. Huit valeurs : `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` | Une couleur par agent, jamais deux fois la même |
| `maxTurns` | **Disjoncteur.** L'agent s'arrête et rend un résultat partiel | Environ le double des échanges mesurés sur cet agent |
| `effort` | Effort de raisonnement : `low` à `max` | Selon la nature du travail, pas selon l'importance de l'agent |
| `model` | `opus`, `sonnet`, `haiku`, `fable`, `inherit`, ou un identifiant complet | **Rien**, tant qu'une épreuve comparative n'a pas mesuré ce qu'on perd |

Réglages disponibles et pas encore utilisés, à essayer sur le banc d'essai avant d'entrer ici :
`permissionMode` (`plan` interdit d'écrire, pour les agents en lecture seule), `hooks`
(un `PreToolUse` qui **bloque** un appel d'outil), `isolation: worktree` (copie isolée du
dépôt, avec contrôle mécanique que l'agent y reste), `disallowedTools`, `memory`.

### État actuel des cinq agents

| Agent | color | maxTurns | effort | model |
|---|---|---|---|---|
| `tdd-writer` | blue | 150 | high | — |
| `verifier` | orange | 50 | high | — |
| `testeur` | green | 60 | medium | — |
| `decoupeur` | cyan | 70 | xhigh | fable |
| `contradicteur` | red | 50 | xhigh | fable |

---

## 2. Le plan de la fiche

### Tronc commun, dans cet ordre

1. **Qui tu es** — deux ou trois phrases. Une identité, pas une procédure. La bonne phrase
   décrit un caractère : « Tu ne connais pas d'autre façon de travailler. »
2. **Qui travaille à côté** — les autres agents en jeu, et ce que leur existence t'interdit.
   Un agent qui sait qu'un autre relira son travail se surveille mieux qu'un agent qui se croit
   seul juge. Ne dis jamais *quand* il intervient : il ne choisit pas son moment, il est lancé.
3. **Le contexte de travail** — seul ou non, dans quelle copie du dépôt, avec quoi déjà écrit
   pour lui. Et, pour tous : personne ne répondra à une question posée en chemin, et une
   commande hors liste blanche attend ce même humain absent. Les agents qui ont `Bash`
   portent la règle de la commande simple : une par appel, sans `sleep`, `curl` ni `echo`
   autour, parce qu'une chaîne n'est autorisée que si chacun de ses morceaux l'est.
4. **La langue** — une phrase.
5. **Le cœur du métier** — voir les deux familles ci-dessous.
6. **Ce que tu rends** — le format exact, montré et non décrit.
7. **Ce qui n'est pas ton travail** — les refus. Section obligatoire.

### Deux familles, un bloc central différent

**Agents de jugement** (`decoupeur`, `contradicteur`, `verifier`). Ils regardent et rendent un
avis. Pas de phases. Leur bloc central est :
- **Ce que tu cherches** — la matière de l'agent, avec un exemple de bon et de mauvais.
- **Le cas que tu rates souvent** — le piège connu, nommé.

**Agents d'exécution** (`tdd-writer`, `testeur`). Ils ont des gestes à faire dans un ordre
imposé. Leur bloc central est :
- **Ce que tu lis avant de commencer** — les fichiers, dans l'ordre.
- **Les phases**, numérotées, avec leurs interdits.
- **Quand t'arrêter** — un compteur que l'agent peut observer lui-même, et ce qu'il rend en
  partant. Un agent qui insiste sur un mur coûte plus cher que tout le reste, et il finit par
  contourner ce qui lui résiste.

---

## 3. Les règles de rédaction

- **Français.** Un mot anglais seulement quand il n'a pas d'équivalent courant et qu'il sert
  d'identifiant (`commit`, `worktree`, `TDD`). Sinon on traduit : « rouge / vert / refactor »,
  pas « RED / GREEN / REFACTOR ».
- **Pas d'emoji.**
- **Chaque interdiction dit pourquoi elle existe.** Une règle sans raison se contourne dès
  qu'elle gêne. Mais on coupe la justification qui rassure le lecteur, et on garde celle qui
  change ce que l'agent fait : lui parler d'un coût qu'il ne peut pas mesurer ne l'aide pas,
  lui nommer le symptôme qu'il va ressentir, si.
- **Phrases courtes, une idée par phrase.** La fiche est lue par un modèle, mais relue par un
  humain qui doit pouvoir la corriger.
- **Montre, ne définis pas.** Un exemple de trois mots vaut mieux qu'une définition de deux
  lignes, et un contre-exemple vaut mieux qu'une nuance : « le formulaire refuse un e-mail mal
  formé » est une livraison ; « ajouter la validation dans la couche service » n'en est pas une.
- **Une phrase, une lecture.** Si une consigne peut se comprendre de deux façons, elle sera
  comprise de la mauvaise. Relis chaque phrase en cherchant sa seconde lecture.
- **La longueur suit le métier** : 60 à 120 lignes pour un agent de jugement, jusqu'à 180 pour
  un agent d'exécution, qui a des gestes à décrire. Au-delà, l'agent fait deux métiers : le
  couper en deux.
- **Aucune consigne annulable.** « Si on insiste, tu peux céder » vide la règle de son sens.
- **Ne jamais s'adresser à un humain.** L'outil pour poser une question est retiré d'office
  de tout sous-agent : une fiche qui dit « demande à l'utilisateur » décrit une action
  impossible, et apprend à l'agent à s'écarter de sa fiche. La bonne conduite est toujours :
  **signaler dans le rapport, et s'arrêter.**
- **Vocabulaire de pilot.** Feature = des semaines, une barre de roadmap. Livraison = une
  demande de fusion. Tâche = des heures. Ne jamais employer « feature » pour « livraison ».

---

## 4. La check-list de cohérence

À passer sur chaque fiche après écriture. Elle vient des défauts réellement trouvés dans les
fiches de ce dossier, pas d'une norme extérieure.

1. **Chaque agent nommé existe-t-il** dans `.claude/agents/` ?
2. **Chaque fichier nommé existe-t-il** dans le circuit ? (`MISSION.md` oui, `PLAN.md` non)
3. **La fiche demande-t-elle quelque chose à un humain ?** Elle ne doit pas.
4. **Ce que la skill `pilot` demande à cet agent est-il écrit dans sa fiche ?** Et l'inverse :
   ce que la fiche promet, la skill l'attend-elle ? C'est le contrôle le plus rentable.
5. **Le vocabulaire est-il respecté ?**
6. **Une consigne peut-elle être annulée par insistance ?** Elle ne doit pas.

Contrôle technique, gratuit et automatique :

```bash
claude plugin validate .claude/agents
```

Il vérifie que le frontmatter de chaque fiche est valide. Il ne dit rien des six points
ci-dessus : un agent inexistant, un fichier fantôme ou une contradiction avec la skill passent
sans bruit.

---

## 5. Où se modifie une fiche

**Dans le dépôt `pilot`, jamais dans un projet.** Le dossier `implementation/agents/` du dépôt
`pilot` est la version de référence ; ce qu'un projet contient dans son `.claude/agents/` en est
une copie, posée par `install.sh` et versionnée avec ce projet.

Modifier la copie d'un projet ne remonte nulle part, et la prochaine mise à jour l'écrase. Une
amélioration de fiche se fait donc dans `pilot`, sur une branche, avec une PR — puis chaque
projet la reçoit quand il décide de se mettre à jour.
