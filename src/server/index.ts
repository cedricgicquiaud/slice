import { createApp } from './app';
import { authBaseUrlFromEnv, authSecretFromEnv, createAuth, oauthApplicationsFromEnv } from './auth/auth';
import { codeSenderFromEnv } from './auth/email-code';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { createHostedStore } from './services/hosted-store';
import { createAccountMcps } from './services/account-mcps';
import { createMcpCalls } from './services/mcp-calls';

const PORT = Number(process.env.PORT ?? 3001);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

try {
  const databaseConfig = databaseConfigFromEnv(process.env);
  const authSecret = authSecretFromEnv(process.env);
  const authBaseUrl = authBaseUrlFromEnv(process.env);
  const database = openDatabase(databaseConfig);
  await migrateDatabase(database);

  // No cleanup: an MCP never expires (WAT-102, D2). `startHostedCleanup` stays, unplugged.
  const hostedStore = createHostedStore(database);
  const accountMcps = createAccountMcps(database);
  const mcpCalls = createMcpCalls(database);

  const auth = createAuth({
    database,
    secret: authSecret,
    baseURL: authBaseUrl,
    ...oauthApplicationsFromEnv(process.env),
    sendCode: codeSenderFromEnv(process.env),
    nodeEnv: process.env.NODE_ENV,
  });

  // The NODE_ENV as declared: the recette sign-in opens only where it says development or test.
  const app = createApp({ nodeEnv: process.env.NODE_ENV, hostedStore, mcpCalls, accountMcps, auth });

  app.listen(PORT, () => {
    console.log(`SLICE server running on http://localhost:${PORT} (${NODE_ENV})`);
  });
} catch (err) {
  console.error(`SLICE server cannot start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
