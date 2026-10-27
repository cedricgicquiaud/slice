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
| SLICE — Modifier un MCP, même adresse | L | 9 (WAT-141 à 149), 3 livraisons en série (L + L + L) | 2026-10-26 10:35 | #70 (L1, 3 tâches) le 26/10 11:42, audit + correction finis 12:32 ; #71 (L2, 4 tâches) le 26/10 14:14, audit + correction + repasse finis 15:02 ; #73 (L3, 2 tâches) le 26/10 16:22, audit + correction + repasse finis 16:53 | L1 : 2026-10-26 12:59 ; L2 : 2026-10-26 15:38 | L1 (L) : horloge 1 h 57 (10:35 → 12:32, heure de Paris ; corrigé, la première note mêlait UTC et heure locale), dont production ~1 h 07, audit + passe visuelle ~45 min (testeur bloqué ~40 min sur une permission), correction ~17 min — estimées d'après les horodatages, `cout-agents` mêle cette livraison 1 aux livraisons 1 des features précédentes. 4 agents (producteur, verifier, testeur, correcteur), 1 correction (insertion par paquets au-delà de 65 535 paramètres), 0 repasse. L2 (L) : horloge 1 h 37 (13:25 → 15:02), dont production 49 min, audit 6 min, passe visuelle bloquée ~30 min (port 3001 tenu par un serveur orphelin de SLICE-1 ; 624 processus orphelins des copies précédentes arrêtés, cause probable des expirations de tests sous charge), correction + repasse ~10 min — estimées d'après les horodatages. 4 agents, 1 correction (test de deux « Save » simultanés, rangée de boutons à 375 px), 1 repasse. Barème L : 1,43 h. L3 (L) : horloge ~1 h (15:55 → 16:53, estimée d'après les horodatages), dont production ~25 min, audit + passe visuelle ~15 min (en parallèle), correction + repasse ~15 min. 4 agents, 1 correction (deux tests ajoutés, espacement du message), 1 repasse ; aucun blocage. |
| SLICE — L'utilisation de ses MCP | L | 12 (WAT-154 à 165), 3 livraisons en série (L + L + L) | 2026-10-26 20:22 | #75 (L1, 5 tâches) le 26/10 22:14, audit + correction finis 22:31, CI verte 22:36 ; #76 (L2, 4 tâches) le 27/10 ~00:15, audit + correction + repasse finis ~00:30 ; #78 (L3, 3 tâches) le 27/10 07:56, audit + correction finis ~08:10 | L1 : 2026-10-26 23:29 ; L2 : 2026-10-27 07:08 ; L3 : 2026-10-27 08:51 | L1 (L) : horloge 2 h 14 (20:22 → 22:36, heure de Paris, estimée d'après les horodatages), dont production 1 h 52, audit ~6 min, correction ~11 min, CI ~5 min ; pas de passe visuelle (livraison sans écran). 3 agents (producteur, verifier, correcteur), 1 correction (4 points : lot à `id` en double, appel jamais raconté, test du JSON illisible, tri stable), 0 repasse. Producteur au-dessus des seuils (454 échanges > 450, 95 M relus > 70) : 5 tâches dont la refonte du relai et la migration régénérée, limite haute d'une L. Barème L : 1,43 h. 1 376 lignes ajoutées. L2 (L) : horloge ~50 min (23:40 → ~00:30, estimée d'après les horodatages), dont production ~35 min, audit + passe visuelle en parallèle, correction + repasse ~10 min. 4 agents (producteur, verifier, testeur, correcteur), 1 correction (dates sur deux lignes, amorce sans action « Never called »), 1 repasse ; testeur bloqué un temps sur la dépendance `playwright` absente de la copie (dossier `node_modules` de l'outil recopié). 1 498 lignes ajoutées. CI rouge une fois sur une erreur non gérée hors de la PR (minuteur du client Better Auth après la fin d'un test d'écran, WAT-166), verte à la relance. L3 (L) : horloge ~1 h (07:10 → ~08:10, estimée d'après les horodatages), dont production ~45 min, audit ~5 min, correction ~10 min ; pas de passe visuelle (livraison sans écran). 3 agents (producteur, verifier, correcteur), 1 correction (4 points : délai prouvé par la route, API qui envoie ses en-têtes puis se tait, borne de temps réel élargie, phrase de la doc), 0 repasse. La liste des fichiers de la mission oubliait la route `hosted-mcp.ts`, par où le délai doit passer : accord donné en cours de run, arrivé trop tard pour le producteur, fait par le correcteur. Course du plafond prouvée seulement en CI (Docker arrêté en local). Tests de démarrage expirés sous charge : la tâche isolée WAT-166 tournait sa suite complète en même temps. 620 lignes ajoutées. Coût par étape (`--projet`) : cadrage 64,04 $, qui contient aussi l'orchestration des trois runs (session du lead restée sur la branche de cadrage) ; production non attribuée (worktrees, rangée « hors méthode »). |

| Feature | Calendrier (jours) | Cadrage | Runs | Attente de merge | Le reste |
|---|---|---|---|---|---|
| SLICE — Les MCP rangés en base de données | 0,5 (23/10 21:20 → 24/10 09:06, 11,8 h) | 0,5 h | 8,4 h (23:26 → 07:48, PR #57 attendant pendant le run de L2) | 1,3 h (dernière PR ouverte → merge) | 1,6 h (entre découpage et run) |
| SLICE — Compte et liste de ses MCP | 1,1 (24/10 18:06 → 25/10 18:54, 25,8 h) | 4,2 h | 6,8 h (L1 5 h 05, L2 ~1 h 20 estimée, L3 25 min) | 12,0 h (#63 9,0 h, la nuit ; #64 1,3 h ; #65 1,7 h) | 2,8 h |
| SLICE — Modifier un MCP, même adresse | 0,3 (26/10 09:15 → 17:03, 7,8 h) | 0,85 h | 4,6 h (L1 1 h 57, L2 1 h 37, L3 ~1 h ; estimées) | 1,2 h (de la fin de l'audit au merge : #70 27 min, #71 36 min, #73 10 min) | 1,15 h (`sync`, tâche isolée WAT-152, attente entre découpage et run) |
| SLICE — L'utilisation de ses MCP | 0,65 (26/10 17:16 → 27/10 08:51, 15,6 h) | 1,8 h | 4,1 h (L1 2 h 14, L2 ~50 min, L3 ~1 h ; estimées) | 9,0 h (de l'ouverture au merge : #75 1,3 h ; #76 6,8 h, la nuit ; #78 0,9 h) | 0,7 h (tâche isolée WAT-166 en parallèle de L3 ; les runs et l'attente se chevauchent pendant les audits) |

L'utilisation de ses MCP, contre Modifier un MCP : les runs restent stables (4,6 h → 4,1 h pour trois L), le cadrage a doublé (0,85 h → 1,8 h, une question incomprise trois fois), et l'attente de merge est remontée (1,2 h → 9,0 h), presque toute la nuit sur #76. Sans la nuit, la feature tiendrait en une demi-journée. `feature_hours_L` reste 1,43 h : les heures de ces livraisons sont estimées, elles n'entrent pas dans la médiane.

Modifier un MCP, contre Compte et liste : tout a rétréci, d'abord l'attente de merge (12,0 h → 1,2 h, merges dans la journée) et le cadrage (4,2 h → 0,85 h). Les runs passent de 6,8 h à 4,6 h ; ils restent dominés par les blocages (une permission en L1, un serveur orphelin en L2), la L3 sans blocage a pris ~1 h. Coût par étape (`--projet`) : cadrage 10,30 $ ; production non attribuée (worktrees, rangée « hors méthode »).

Compte et liste, contre base de données : l'attente de merge a grossi (1,3 h → 12,0 h, dont 9 h de nuit sur #63), le cadrage aussi (0,5 h → 4,2 h, entretien en deux tours et une décision reprise). Les runs restent sous 7 h pour une feature XL.

Première feature mesurée sur ce projet : pas de comparaison. Le run domine, et il est gonflé par 7 h de blocage sur une autorisation de commande la nuit ; le travail réel des agents est d'environ 1 h.

## Durées de cadrage

| Feature | Lancement `feature` | Découpage validé | Questions posées |
|---|---|---|---|
| SLICE — Actions classées lecture, écriture | 2026-10-23 19:58 | — (annulée : déjà en place à l'écran 2, devenue WAT-60) | 8 (contradicteur) |
| SLICE — Les MCP rangés en base de données | 2026-10-23 21:20 | 2026-10-23 21:50 | 19 (contradicteur) + 6 (découpeur) + 1 (choix de la base) |
| SLICE — Compte et liste de ses MCP | 2026-10-24 18:06 | 2026-10-24 22:20 | 12 (entretien, 2 rounds) + 15 (contradicteur) + 8 (découpeur) ; 1 décision reprise par l'humain (compte obligatoire pour tout SLICE) |
| SLICE — Modifier un MCP, même adresse | 2026-10-26 09:15 | 2026-10-26 10:06 | 6 (entretien, 1 round) + 13 (contradicteur, tranchées une à une à la demande de l'humain) + 3 (découpeur) ; taille M → L, 2 → 3 livraisons ; 1 décision amendée (deprecated cachées : faux, retiré) |
| SLICE — L'utilisation de ses MCP | 2026-10-26 17:16 | 2026-10-26 19:05 | 8 annoncées, 2 posées (entretien : la 1re incomprise trois fois, tranchée par Claude ; la page d'exemple retenue, le reste laissé à la recommandation) + 14 (contradicteur, tranchées par Claude, 3 remontées) + 5 frontières (découpeur, tranchées par Claude, 1 remontée) ; taille M → L, 2 → 3 livraisons ; 1 décision amendée (message du plafond) |
