# SLICE — PRD

_Repris le 2026-10-23 du README et de l'état du produit, complété des décisions du jour._

## Utilisateurs

- **Principal** : la personne qui branche une API sur un agent IA (Claude, ChatGPT, Cursor,
  n8n) sans vouloir écrire de code. Consultant IA, profil « un peu tech », équipe
  opérationnelle d'une entreprise.
- **Secondaire** : l'entreprise qui doit décider qui, en son sein, peut faire quoi avec son
  API à travers un agent.

## Problème

Brancher une API entière sur un agent lui donne trop de pouvoir (un agent qui lit des
commandes n'a pas à pouvoir les supprimer) et noie son contexte. Les générateurs existants
visent les développeurs (CLI, fichiers de configuration).

## Ce que fait SLICE aujourd'hui (V1, en place)

- Lire une description d'API (OpenAPI 3.x, Swagger 2.0, collection Postman), par fichier ou
  par adresse — y compris l'adresse d'une page de documentation, où SLICE cherche le fichier.
- Cocher les actions autorisées ; ce qui n'est pas coché n'existe pas pour l'agent.
- Deux livraisons : un **connecteur hébergé** (une adresse à coller dans l'agent, la clé de
  l'utilisateur relayée sans être stockée, expiration 72 h en gratuit) ou un **kit** à
  installer soi-même (Docker).
- Accès amont : clé d'API, jeton bearer, OAuth2 `client_credentials`.

## Décisions du 2026-10-23

- **SLICE peut stocker, chiffrés, les accès de ses utilisateurs.** Renverse la promesse
  « rien n'est stocké » : sans ça, pas de connexion « l'utilisateur clique sur Autoriser »
  (cas Pipedrive), pas de ChatGPT ni de claude.ai web, pas de statistiques ni de rôles.
- **Deux modes assumés** : hébergé (simple, SLICE stocke ce qu'il faut) et kit (l'entreprise
  repart avec son connecteur, utile pour une API interne non exposée). **Le kit est mis de
  côté** jusqu'à ce que le chantier ci-dessous soit testé.
- **Rôles** : une seule adresse par API ; chaque personne est identifiée et ne voit que les
  actions de son rôle. Pas une adresse par rôle.

## Prochain périmètre (mode hébergé)

Connexion + base de données :
- connexion de l'utilisateur et stockage chiffré de ses accès amont (dont OAuth
  « code d'autorisation ») ;
- modifier un connecteur sans changer son adresse, avec ses versions ;
- suivi d'utilisation (quelle action, quand, succès, durée — jamais le contenu) ;
- rôles et personnes ;
- étiquettes lecture / écriture / destruction posées sur chaque action.

## Hors périmètre

- Le kit à installer soi-même (ni remise en avant, ni rôles dedans) — après test du mode hébergé.
- Écho, l'idée de connecteurs d'affiliation pour créateurs : second produit éventuel, hors dépôt.
- Facturation : pas tant que la demande n'est pas validée par de vrais contacts.

## Contraintes

- Stack en place : React 19 + Vite, Express 5, TypeScript strict, Vitest, pnpm 9, Node 22.
- Dépôt public : aucune idée stratégique ni secret dans le dépôt.
- Interface en anglais pour l'instant.
- SLICE sert aussi de projet de **certification de développeur** de Cédric : la base de
  données doit répondre à un vrai besoin du produit.
- Échéance : à fixer (date de la certification).
