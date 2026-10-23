# SLICE — direction visuelle

_Relevée le 2026-10-23 sur l'interface existante (`src/client/index.css`). Le produit a déjà_
_son système : les nouveaux écrans le prolongent, ils ne le réinventent pas._

## Ce qui est imposé

- **Composants** : shadcn/ui (Radix) + Tailwind CSS v4, icônes Lucide.
- **Couleurs** (thème clair) : fond crème `#f8f5ec`, cartes `#fdfbf3` / `#f5f0df`, encre
  indigo `#2826a8` pour le texte principal et l'action primaire, nuances `#4f4eb8`,
  `#5e5db4`, `#9c9bd0`. Thème sombre défini (`#0a0c10` en fond). Toujours passer par les
  variables `--slice-*`, jamais de couleur en dur.
- **Typographie** : Geist pour l'interface, Fraunces (serif) pour les titres d'accroche,
  JetBrains Mono pour le code, les adresses et les noms techniques.
- **Rayon** : `0.5rem`.
- **Langue de l'interface** : anglais.

## Le registre

Aéré, chaleureux, lisible par un non-développeur. Vocabulaire humain : « actions » plutôt que
« endpoints » quand c'est montré à un utilisateur, le jargon dans des infobulles.
Un parcours court : trois étapes maximum pour obtenir un connecteur.

## Références

- L'interface actuelle de SLICE elle-même (écrans upload, sélection, configuration, adresse).
- Pour les écrans à venir (connexion, tableau d'utilisation, rôles) : la sobriété des réglages
  de connecteurs de Claude — une liste d'actions avec un interrupteur et une étiquette
  lecture / écriture.
