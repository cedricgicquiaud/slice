// Amorce de recette — à évaluer dans la page de l'application lancée par `pnpm dev`
// (http://localhost:5173). Ouvre une session pour le compte recette@slice.local via
// POST /api/dev/sign-in ; la route n'existe que si NODE_ENV vaut development ou test
// (refus prouvé par src/server/auth/dev-sign-in.test.ts).
// L'outil de passe visuelle (--amorce) attend la fin de ce code, puis recharge lui-même la page.
// À la main : coller ce code dans la console du navigateur, puis recharger la page.
const res = await fetch('/api/dev/sign-in', { method: 'POST' });
if (!res.ok) throw new Error(`Recette session refused (HTTP ${res.status})`);
