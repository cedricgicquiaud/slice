# Barème de charge

Source : AlanZien/SLICE, weme-studio/Nexus — 344 PR mergées.

## Paramètres (utilisés par `roadmap` et `sync`)

```yaml
# heures de session par feature, selon sa taille
feature_hours_S: 0.22
feature_hours_M: 0.69
feature_hours_L: 1.43   # médiane SLICE de 2 livraisons L (0,85 h ; 2,0 h), 25/10
feature_hours_XL: 3.27
feature_overhead_hours: 0.5   # validation du découpage + relecture de PR, hypothèse initiale recalibrée par sync
hours_per_active_day: 6.7
days_per_week: observed   # remplacer par un nombre (ex. 2) pour forcer la capacité
```

## Observations

| Taille | Diff (lignes) | Livraisons | Temps médian par livraison (h) | Heures par feature (× facteur) |
|---|---|---|---|---|
| S | 1–150 | 117 | 0.22 | 0.22 (×1) |
| M | 151–600 | 139 | 0.34 | 0.69 (×2) |
| L | 601–2000 | 74 | 0.65 | 1.94 (×3) |
| XL | > 2000 | 14 | 0.65 | 3.27 (×5) |

| Dépôt | PR | Période | Jours actifs | Heures / jour actif | Jours actifs / semaine |
|---|---|---|---|---|---|
| AlanZien/SLICE | 44 | 2026-05-25 → 2026-07-22 | 9 | 6.3 | 1.1 |
| weme-studio/Nexus | 300 | 2026-06-10 → 2026-08-19 | 45 | 7.1 | 4.5 |

## Comment lire

- Avec Claude Code, une PR est mergée en quelques minutes : le temps d'attente humaine ne
  mesure rien. Ce qui compte est le **temps de session** par livraison et le **nombre de
  jours** où l'humain travaille sur le projet.
- Temps par livraison = intervalle entre deux merges d'une même session (< 4 h).
- Heures par feature = temps par livraison × facteur (S=1, M=2, L=3, XL=5), car une
  feature regroupe plusieurs tâches et des validations. Point de départ, recalibré par `sync`.
- Fenêtre d'une feature = heures cumulées ÷ heures par jour actif ÷ jours actifs par semaine.

## Historique des features (rempli par `next` et `sync`)

| Feature | Taille | Tâches | Début | PR ouverte | Mergée | Heures réelles |
|---|---|---|---|---|---|---|
| SLICE — Les MCP rangés en base de données | L | 6 (WAT-61 à 66), 2 livraisons (S + L) | 2026-10-23 23:26 | #57 le 24/10 00:02, #58 le 24/10 07:48 | 2026-10-24 09:06 (les deux) | L1 (S) 0,12 h ; L2 (L) 0,85 h — colonne « actif ». Horloge L2 8 h 51, dont 7 h bloqué sur une commande en attente d'autorisation. Coût par étape : non attribué par `cout-agents --projet` (production en worktrees, rangée « hors méthode ») |
| SLICE — Compte et liste de ses MCP | XL | 12 (WAT-96 à 107), 3 livraisons en série (XL + L + M) | 2026-10-24 22:30 | #63 (L1, 7 tâches) le 25/10 00:34, audit + correction finis 03:37 ; #64 (L2, 3 tâches) le 25/10 ~10:30, audit + correction + repasse finis ~11:05 ; #65 (L3, 2 tâches) le 25/10 17:12, audit fini 17:40 | L1 : 2026-10-25 09:35 ; L2 : 2026-10-25 11:47 ; L3 : 2026-10-25 18:54 | L1 (XL) ≈ 4,8 h — colonne « actif » (4 h 57 pour la ligne « 1 » du relevé, qui contient aussi la L1 de la feature base de données, 0,12 h, retirée). 10 agents, 1 correction. Horloge 5 h 05 (22:30 → 03:37), dont production t1-t7 ~2 h, audit + correction ~1 h 30, attentes ~1 h 30. Au merge : 3 décisions tranchées, `BETTER_AUTH_URL` exigée en production (2 commits ajoutés). L2 (L) ≈ 2,0 h — colonne « actif » (2 h 49 pour la ligne « 2 » du relevé, qui contient aussi la L2 de la feature base de données, 0,85 h, retirée) ; ≈ 50 M relus. 4 agents (producteur, verifier, testeur, correcteur), 1 correction, 1 repasse. Horloge estimée ~1 h 20 (producteur ~40 min). L3 (M) 23 min — colonne « actif » de la ligne « 3 » du relevé ; 34 M relus, 3 agents (producteur, verifier, testeur), 0 correction, horloge 25 min mesurée (barème M : 0,69 h). Lead 6 min, 11 % des jetons. Au merge : 2 décisions (fraîcheur de session, contrôle d'origine en production), mergée avec le choix d'attente. Coût par étape (`--projet`) : cadrage 13,07 $ ; production non attribuée (worktrees, rangée « hors méthode ») |

| Feature | Calendrier (jours) | Cadrage | Runs | Attente de merge | Le reste |
|---|---|---|---|---|---|
| SLICE — Les MCP rangés en base de données | 0,5 (23/10 21:20 → 24/10 09:06, 11,8 h) | 0,5 h | 8,4 h (23:26 → 07:48, PR #57 attendant pendant le run de L2) | 1,3 h (dernière PR ouverte → merge) | 1,6 h (entre découpage et run) |
| SLICE — Compte et liste de ses MCP | 1,1 (24/10 18:06 → 25/10 18:54, 25,8 h) | 4,2 h | 6,8 h (L1 5 h 05, L2 ~1 h 20 estimée, L3 25 min) | 12,0 h (#63 9,0 h, la nuit ; #64 1,3 h ; #65 1,7 h) | 2,8 h |

Compte et liste, contre base de données : l'attente de merge a grossi (1,3 h → 12,0 h, dont 9 h de nuit sur #63), le cadrage aussi (0,5 h → 4,2 h, entretien en deux tours et une décision reprise). Les runs restent sous 7 h pour une feature XL.

Première feature mesurée sur ce projet : pas de comparaison. Le run domine, et il est gonflé par 7 h de blocage sur une autorisation de commande la nuit ; le travail réel des agents est d'environ 1 h.

## Durées de cadrage

| Feature | Lancement `feature` | Découpage validé | Questions posées |
|---|---|---|---|
| SLICE — Actions classées lecture, écriture | 2026-10-23 19:58 | — (annulée : déjà en place à l'écran 2, devenue WAT-60) | 8 (contradicteur) |
| SLICE — Les MCP rangés en base de données | 2026-10-23 21:20 | 2026-10-23 21:50 | 19 (contradicteur) + 6 (découpeur) + 1 (choix de la base) |
| SLICE — Compte et liste de ses MCP | 2026-10-24 18:06 | 2026-10-24 22:20 | 12 (entretien, 2 rounds) + 15 (contradicteur) + 8 (découpeur) ; 1 décision reprise par l'humain (compte obligatoire pour tout SLICE) |
| SLICE — Modifier un MCP, même adresse | 2026-10-26 09:15 | 2026-10-26 10:06 | 6 (entretien, 1 round) + 13 (contradicteur, tranchées une à une à la demande de l'humain) + 3 (découpeur) ; taille M → L, 2 → 3 livraisons ; 1 décision amendée (deprecated cachées : faux, retiré) |
