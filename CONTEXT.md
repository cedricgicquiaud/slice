# SLICE

Service web qui transforme la description d'une API en MCP pour agent IA, limité aux
actions que l'utilisateur autorise.

## Vocabulaire

**Description d'API** :
Le fichier qui décrit une API pour une machine (OpenAPI 3.x, Swagger 2.0 ou collection
Postman), fourni par fichier ou par adresse.
_Éviter_ : spec (dans l'interface), documentation, notice

**Action** :
Une opération de l'API que l'agent peut appeler (lire une page, créer une facture). Côté code,
une action correspond à un endpoint et devient un tool MCP.
_Éviter_ : route, outil (dans l'interface)

**Sélection** :
L'ensemble des actions cochées par l'utilisateur ; tout le reste n'existe pas pour l'agent.
_Éviter_ : filtre, curation (dans l'interface)

**MCP** :
Le serveur MCP produit par SLICE à partir d'une sélection. Le mot que cherchent les
utilisateurs dans leur agent ; c'est celui de l'interface (décision du 24/10/2026).
_Éviter_ : connecteur (dans l'interface), bot, plugin

**MCP hébergé** :
Un MCP que SLICE fait tourner et rend accessible par une adresse.
_Éviter_ : SLICE Cloud (nom commercial seulement), instance

**Adresse** :
L'URL d'un MCP hébergé, à coller dans l'agent.
_Éviter_ : endpoint, lien

**Kit** :
Le dossier téléchargeable (code + Docker) pour faire tourner un MCP sur son propre
serveur.
_Éviter_ : bundle, ZIP, self-host (dans l'interface)

**Accès amont** :
Ce qui autorise le MCP auprès de l'API d'origine : clé d'API, jeton, OAuth2.
_Éviter_ : auth, credentials

**Relai** :
Le fait que le MCP transmette à l'API l'accès amont fourni par l'agent, à chaque appel.
_Éviter_ : proxy, passthrough

**Expiration** :
La fin de vie d'une adresse hébergée. Aujourd'hui, un MCP n'expire pas : son adresse répond quel que soit son âge,
tant qu'il n'est pas supprimé. L'interface ne montre aucune date d'expiration.
_Éviter_ : TTL (dans l'interface)

**Compte** :
La personne connectée à SLICE, identifiée par son adresse e-mail vérifiée. Sans compte,
SLICE ne sert à rien.
_Éviter_ : utilisateur (pour la donnée), profil, login

**Espace** :
Ce à quoi appartiennent les MCP. Chaque compte a son espace personnel, invisible tant que
les espaces d'équipe n'existent pas.
_Éviter_ : workspace, organisation, équipe (pour l'espace personnel)
