// Amorce de recette — à évaluer dans la page de l'application lancée par `pnpm dev`
// (http://localhost:5173). Ouvre une session pour le compte recette@slice.local via
// POST /api/dev/sign-in, puis recharge la page : l'accueil remplace l'écran de connexion.
// La route n'existe pas en production (refus prouvé par src/server/auth/dev-sign-in.test.ts).
(async () => {
  const res = await fetch('/api/dev/sign-in', { method: 'POST' });
  if (!res.ok) throw new Error(`Recette session refused (HTTP ${res.status})`);
  location.reload();
})();
