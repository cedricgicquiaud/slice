# SLICE

Service web qui transforme la description d'une API en connecteur pour agent IA, limité aux
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

**Connecteur** :
Le serveur MCP produit par SLICE à partir d'une sélection.
_Éviter_ : MCP (dans l'interface), bot, plugin

**Connecteur hébergé** :
Un connecteur que SLICE fait tourner et rend accessible par une adresse.
_Éviter_ : SLICE Cloud (nom commercial seulement), instance

**Adresse** :
L'URL d'un connecteur hébergé, à coller dans l'agent.
_Éviter_ : endpoint, lien

**Kit** :
Le dossier téléchargeable (code + Docker) pour faire tourner un connecteur sur son propre
serveur.
_Éviter_ : bundle, ZIP, self-host (dans l'interface)

**Accès amont** :
Ce qui autorise le connecteur auprès de l'API d'origine : clé d'API, jeton, OAuth2.
_Éviter_ : auth, credentials

**Relai** :
Le fait que le connecteur transmette à l'API l'accès amont fourni par l'agent, à chaque appel.
_Éviter_ : proxy, passthrough

**Expiration** :
La fin de vie d'une adresse gratuite, 72 h après sa création par défaut.
_Éviter_ : TTL (dans l'interface)
