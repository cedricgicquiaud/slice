import express, { type Express } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUploadRouter, createUploadUrlRouter } from './routes/upload';
import { createGenerateRouter } from './routes/generate';
import { createHostRouter } from './routes/host';
import { createHostedMcpRouter } from './routes/hosted-mcp';
import type { HostedStore } from './services/hosted-store';
import type { SliceAuth } from './auth/auth';
import { requireSession } from './middleware/require-session';

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
  /**
   * Free-tier TTL (hours) for hosted MCP URLs; 0 disables expiry entirely
   * (self-host deployments). Defaults to SLICE_HOSTED_TTL_HOURS or 72.
   */
  hostedTtlHours?: number;
  /** Where hosted connectors live. Without it, the hosted routes are not mounted. */
  hostedStore?: HostedStore;
  /** Clock for hosted connectors (creation date, expiry). Defaults to the system clock. */
  now?: () => Date;
  /** Accounts and sessions. Without it, every `/api/*` call but health is refused. */
  auth?: SliceAuth;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const allowPrivateHosts = options.allowPrivateHosts ?? nodeEnv !== 'production';
  const app = express();

  app.use(cors());
  // Global JSON parser at 10 MB for the default API. The /api/generate
  // route ships its own 15 MB parser; we skip the global one on that path
  // so the larger limit is the only one applied (R1.6.8).
  app.use((req, res, next) => {
    // /api/generate and /api/host ship their own 15 MB parser; skip the global
    // one on those paths so the larger limit is the only one applied.
    if (req.path.startsWith('/api/generate') || req.path.startsWith('/api/host')) return next();
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

  app.use('/api/', apiLimiter);
  app.use('/api/', requireSession(options.auth));

  // POST /api/upload — phase 02 (multer applies its own 10 MB limit before json parser)
  app.use('/api/upload', createUploadRouter());
  // POST /api/upload-url — fetch a spec from a public HTTPS URL (SSRF-safe)
  app.use('/api/upload-url', createUploadUrlRouter());

  // POST /api/generate — phase 08. Mounts its own 15 MB JSON parser; the
  // 10 MB app-level one is bypassed by the path-specific router order.
  app.use('/api/generate', createGenerateRouter());

  // Pivot-4 — SLICE Cloud. POST /api/host stores a config and returns a URL;
  // /m/:id is the hosted MCP runtime (not under /api/, so not rate-limited
  // like the upload/generate endpoints — agents call it freely).
  if (options.hostedStore) {
    const hosted = {
      store: options.hostedStore,
      now: options.now ?? (() => new Date()),
      allowPrivateHosts,
      ttlHours: options.hostedTtlHours,
    };
    app.use('/api/host', createHostRouter(hosted));
    app.use('/m', createHostedMcpRouter(hosted));
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
