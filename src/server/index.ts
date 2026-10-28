import { createApp } from './app';
import { authBaseUrlFromEnv, authSecretFromEnv, createAuth, oauthApplicationsFromEnv } from './auth/auth';
import { codeSenderFromEnv } from './auth/email-code';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { createHostedStore } from './services/hosted-store';
import { createAccountMcps } from './services/account-mcps';
import { createMcpCalls, startCallsCleanup } from './services/mcp-calls';
import { encryptionKeyFromEnv } from './services/key-cipher';

const PORT = Number(process.env.PORT ?? 3001);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

try {
  const databaseConfig = databaseConfigFromEnv(process.env);
  const authSecret = authSecretFromEnv(process.env);
  const authBaseUrl = authBaseUrlFromEnv(process.env);
  // Read before anything opens, so a server without it never starts (D11); WAT-169 hands it to the MCPs' keys.
  encryptionKeyFromEnv(process.env);
  const database = openDatabase(databaseConfig);
  await migrateDatabase(database);

  // No cleanup: an MCP never expires (WAT-102, D2). `startHostedCleanup` stays, unplugged.
  const hostedStore = createHostedStore(database);
  const accountMcps = createAccountMcps(database);
  const mcpCalls = createMcpCalls(database);
  // The calls of more than 30 days leave the database within the hour (D9).
  startCallsCleanup(mcpCalls, { now: () => new Date() });

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
