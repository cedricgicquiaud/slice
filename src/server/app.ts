import express, { type Express } from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUploadRouter, createUploadUrlRouter } from './routes/upload';
import { createGenerateRouter } from './routes/generate';
import { createHostRouter } from './routes/host';
import { createHostedMcpRouter } from './routes/hosted-mcp';
import { createMcpsRouter } from './routes/mcps';
import { devGarbleApiKey } from './routes/dev-api-key';
import type { HostedStore } from './services/hosted-store';
import type { AccountMcps } from './services/account-mcps';
import type { McpCalls } from './services/mcp-calls';
import type { McpApiKeys } from './services/mcp-api-key';
import type { SliceAuth } from './auth/auth';
import { devSignIn } from './auth/dev-sign-in';
import { requireSameOrigin, requireSession } from './middleware/require-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CreateAppOptions {
  nodeEnv?: string;
  clientDist?: string;
  /**
   * Allow the hosted runtime to target loopback/private hosts. Disabled in
   * production (SSRF guard active); defaults to on for dev/test so a local
   * upstream can be reached. Never enable this on a deployed instance.
   */
  allowPrivateHosts?: boolean;
  /** Where hosted connectors live. Without it, the hosted routes are not mounted. */
  hostedStore?: HostedStore;
  /** Where the notes of the hosted MCPs' action calls go. Without it, no call is noted. */
  mcpCalls?: McpCalls;
  /** How long a hosted MCP's action waits for the API. Defaults to 30 seconds; tests shorten it. */
  upstreamTimeoutMs?: number;
  /** The MCPs of each account's workspace. Without it, `/api/mcps` is not mounted. */
  accountMcps?: AccountMcps;
  /** The MCPs' API keys, encrypted. Without them, `/api/mcps/:id/api-key` is not mounted. */
  mcpApiKeys?: McpApiKeys;
  /**
   * The same keys, sealed under an encryption key drawn at random: the recette's
   * garble route writes through them (D17). Without them, that route is not mounted.
   */
  mcpApiKeysUnderAnotherKey?: McpApiKeys;
  /** Clock that dates a created connector and a saved key. Defaults to the system clock. */
  now?: () => Date;
  /** Accounts and sessions. Without it, every `/api/*` call but health is refused. */
  auth?: SliceAuth;
  /**
   * SLICE's public address (`BETTER_AUTH_URL`): the MCPs' addresses start with it (D5).
   * Without it, they start with the address the request reached.
   */
  publicUrl?: string;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const declaredEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const nodeEnv = declaredEnv ?? 'development';
  const allowPrivateHosts = options.allowPrivateHosts ?? nodeEnv !== 'production';
  const app = express();

  // Agents may call a hosted MCP from anywhere; the API answers SLICE's own page only (D16).
  app.use('/m', cors());
  // Global JSON parser at 10 MB for the default API. The /api/generate
  // route ships its own 15 MB parser; we skip the global one on that path
  // so the larger limit is the only one applied (R1.6.8).
  app.use((req, res, next) => {
    // /api/generate and /api/host ship their own 15 MB parser; skip the global
    // one on those paths so the larger limit is the only one applied. Better
    // Auth reads its own request bodies under /api/auth.
    if (req.path.startsWith('/api/generate') || req.path.startsWith('/api/host')) return next();
    if (req.path.startsWith('/api/auth/')) return next();
    return express.json({ limit: '10mb' })(req, res, next);
  });

  // Rate limiting: 30 req/min per IP on sensitive endpoints (R1.1.10, R1.4.5)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again in a minute.' },
  });

  // Health check is exempted from rate limiting so monitoring/CI behind
  // shared NAT can probe freely without exhausting the IP quota.
  app.get('/api/health', async (_req, res) => {
    const timestamp = new Date().toISOString();
    try {
      await options.hostedStore?.ping();
    } catch {
      res.status(503).json({ ok: false, status: 'database unreachable', env: nodeEnv, timestamp });
      return;
    }
    res.json({ ok: true, status: 'ok', env: nodeEnv, timestamp });
  });

  // Sign-in routes answer without a session (Better Auth rate-limits them itself).
  if (options.auth) app.all('/api/auth/{*any}', toNodeHandler(options.auth));
  // Recette primer: a session without proof, so mounted only where NODE_ENV says development or test.
  if (options.auth && (declaredEnv === 'development' || declaredEnv === 'test')) {
    app.post('/api/dev/sign-in', devSignIn(options.auth));
  }

  app.use('/api/', apiLimiter);
  app.use('/api/', requireSameOrigin(options.auth));
  app.use('/api/', requireSession(options.auth));

  // POST /api/upload — phase 02 (multer applies its own 10 MB limit before json parser)
  app.use('/api/upload', createUploadRouter());
  // POST /api/upload-url — fetch a spec from a public HTTPS URL (SSRF-safe)
  app.use('/api/upload-url', createUploadUrlRouter());

  // POST /api/generate — phase 08. Mounts its own 15 MB JSON parser; the
  // 10 MB app-level one is bypassed by the path-specific router order.
  app.use('/api/generate', createGenerateRouter());

  // GET /api/mcps, DELETE /api/mcps/:id — the account's own MCPs (D9, D10), and their API keys (D3).
  if (options.accountMcps) {
    const now = options.now ?? (() => new Date());
    app.use('/api/mcps', createMcpsRouter(options.accountMcps, { apiKeys: options.mcpApiKeys, now }));
  }
  // Recette primer: an unreadable key, so mounted only where NODE_ENV says development or test (D17).
  const { accountMcps, mcpApiKeys, mcpApiKeysUnderAnotherKey } = options;
  if (accountMcps && mcpApiKeys && mcpApiKeysUnderAnotherKey && (declaredEnv === 'development' || declaredEnv === 'test')) {
    app.post('/api/dev/mcps/:id/api-key/garble', devGarbleApiKey(accountMcps, mcpApiKeys, mcpApiKeysUnderAnotherKey));
  }

  // Pivot-4 — SLICE Cloud. POST /api/host stores a config and returns a URL;
  // /m/:id is the hosted MCP runtime (not under /api/, so not rate-limited
  // like the upload/generate endpoints — agents call it freely).
  if (options.hostedStore) {
    const hosted = {
      store: options.hostedStore,
      now: options.now ?? (() => new Date()),
      allowPrivateHosts,
    };
    app.use('/api/host', createHostRouter({ ...hosted, publicUrl: options.publicUrl }));
    app.use(
      '/m',
      createHostedMcpRouter({
        ...hosted,
        calls: options.mcpCalls,
        apiKeys: options.mcpApiKeys,
        upstreamTimeoutMs: options.upstreamTimeoutMs,
      })
    );
  }

  if (nodeEnv === 'production') {
    const clientDist = options.clientDist ?? path.resolve(__dirname, '../../client');
    app.use(express.static(clientDist));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
