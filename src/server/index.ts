import { createApp } from './app';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { migrateDatabase } from './db/migrate';
import { createHostedStore } from './services/hosted-store';

const PORT = Number(process.env.PORT ?? 3001);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

const database = openDatabase(databaseConfigFromEnv(process.env));
await migrateDatabase(database);

const app = createApp({ nodeEnv: NODE_ENV, hostedStore: createHostedStore(database) });

app.listen(PORT, () => {
  console.log(`SLICE server running on http://localhost:${PORT} (${NODE_ENV})`);
});
