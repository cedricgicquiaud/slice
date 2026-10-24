import { createApp } from './app';
import { createAuth } from './auth/auth';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { defaultTtlHours } from './routes/hosted-mcp';
import { createHostedStore, startHostedCleanup } from './services/hosted-store';

const PORT = Number(process.env.PORT ?? 3001);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

try {
  const database = openDatabase(databaseConfigFromEnv(process.env));
  await migrateDatabase(database);

  const hostedStore = createHostedStore(database);
  startHostedCleanup(hostedStore, { ttlHours: defaultTtlHours(), now: () => new Date() });

  // Secret and public address come from BETTER_AUTH_SECRET and BETTER_AUTH_URL.
  const auth = createAuth({ database });

  const app = createApp({ nodeEnv: NODE_ENV, hostedStore, auth });

  app.listen(PORT, () => {
    console.log(`SLICE server running on http://localhost:${PORT} (${NODE_ENV})`);
  });
} catch (err) {
  console.error(`SLICE server cannot start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
