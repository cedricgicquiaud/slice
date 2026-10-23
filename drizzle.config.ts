import { defineConfig } from 'drizzle-kit';

// Generates the versioned SQL migrations from the schema (no database needed):
//   node_modules/.bin/drizzle-kit generate
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
});
