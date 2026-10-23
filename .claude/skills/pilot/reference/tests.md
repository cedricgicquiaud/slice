# Les tests — ce qu'est un bon test, et les trois façons d'en écrire un mauvais

_Lu par le `tdd-writer` avant son premier test, et par le `verifier` quand il lit le diff des_
_tests. Repris de la skill `tdd` de Matt Pocock (1.2.3)._

## Un bon test

Il vérifie un **comportement** à travers l'**interface publique** du module, jamais son
intérieur. Il se lit comme une phrase du contrat : « un membre pose une étiquette sur un
contact » dit ce que le produit sait faire, et le test survit à une réécriture interne
parce qu'il ne regarde pas comment c'est fait.

```js
// BON : le comportement observable, par l'interface
test("un membre pose une étiquette sur un contact", () => {
  const contact = Contacts.create(ws, { nom: "Dupont" });
  Contacts.addTag(user, ws, contact.id, "Client");
  assert.deepStrictEqual(Contacts.get(ws, contact.id).tags, ["Client"]);
});
```

Une seule vérification logique par test ; un nom à l'affirmative qui dit **quoi**, pas
**comment** ; une valeur attendue qui vient d'une **source indépendante** : un littéral connu,
un exemple calculé à la main, la phrase du contrat.

## Les trois mauvais tests

**Couplé à l'implémentation.** Il simule un collaborateur interne, teste une fonction privée,
compte les appels, ou vérifie par un chemin détourné (une requête SQL au lieu de l'interface).
Le signe : il casse quand on refactorise sans changer le comportement.

```js
// MAUVAIS : vérifie par la base, pas par l'interface
test("createUser écrit en base", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  assert.ok(row);
});
// BON : vérifie par l'interface
test("un utilisateur créé se retrouve par son id", async () => {
  const user = await createUser({ name: "Alice" });
  assert.strictEqual((await getUser(user.id)).name, "Alice");
});
```

**Tautologique.** La valeur attendue est recalculée comme le code la calcule, si bien que le
test passe par construction et ne peut jamais contredire le code.

```js
// MAUVAIS : l'attendu refait le calcul
const expected = items.reduce((s, i) => s + i.price, 0);
assert.strictEqual(total(items), expected);
// BON : l'attendu est un littéral connu
assert.strictEqual(total([{ price: 10 }, { price: 5 }]), 15);
```

**En tranche horizontale.** Tous les tests d'abord, tout le code ensuite. Des tests écrits en
bloc vérifient un comportement *imaginé* et figent une structure avant de comprendre
l'implémentation. La méthode est la **tranche verticale** : un test, son code, le suivant ;
chaque cycle apprend du précédent.

## Simuler seulement aux frontières

On remplace par un simulacre (*mock*) ce qui est **hors du système** : une API externe
(paiement, e-mail), l'horloge et le hasard, parfois le système de fichiers ou la base (une
base de test vaut mieux). Jamais ses propres modules ni ses collaborateurs internes.

Pour que la frontière se simule bien : **injecter** la dépendance externe plutôt que la
construire à l'intérieur (`processPayment(order, paymentClient)` plutôt que `new
StripeClient()` dans la fonction), et exposer une fonction par opération (`api.getUser(id)`,
`api.createOrder(data)`) plutôt qu'un `fetch` générique dont le simulacre devrait deviner
l'URL.
