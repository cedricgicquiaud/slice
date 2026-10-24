import { createApp } from './app';
import { authBaseUrlFromEnv, authSecretFromEnv, createAuth, oauthApplicationsFromEnv } from './auth/auth';
import { codeSenderFromEnv } from './auth/email-code';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { defaultTtlHours } from './routes/hosted-mcp';
import { createHostedStore, startHostedCleanup } from './services/hosted-store';

const PORT = Number(process.env.PORT ?? 3001);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

try {
  const databaseConfig = databaseConfigFromEnv(process.env);
  const authSecret = authSecretFromEnv(process.env);
  const database = openDatabase(databaseConfig);
  await migrateDatabase(database);

  const hostedStore = createHostedStore(database);
  startHostedCleanup(hostedStore, { ttlHours: defaultTtlHours(), now: () => new Date() });

  const auth = createAuth({
    database,
    secret: authSecret,
    baseURL: authBaseUrlFromEnv(process.env),
    ...oauthApplicationsFromEnv(process.env),
    sendCode: codeSenderFromEnv(process.env),
  });

  const app = createApp({ nodeEnv: NODE_ENV, hostedStore, auth });

  app.listen(PORT, () => {
    console.log(`SLICE server running on http://localhost:${PORT} (${NODE_ENV})`);
  });
} catch (err) {
  console.error(`SLICE server cannot start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
