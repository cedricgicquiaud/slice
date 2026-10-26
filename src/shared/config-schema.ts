import { z } from 'zod';

/**
 * Shared validation contract for the configuration step (phase 06) and the
 * generation request (phase 07). The same schema runs in the browser (form
 * feedback) and on the server (request guard) — a single source of truth.
 */

export const mcpNameSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes only')
  .min(3, 'at least 3 characters')
  .max(40, 'at most 40 characters');

const SAFE_URL = /^[^'"`\\\s\x00-\x1f]+$/;

export const baseUrlSchema = z
  .string()
  .min(1, 'required')
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    'must be a valid http(s) URL'
  )
  // Written into the generated kit (.env, README snippet): no character that
  // could break out of a string or a line. Defense-in-depth, values are also encoded.
  .refine((value) => SAFE_URL.test(value), 'URL contains forbidden characters');

// OAuth2 values are injected into generated JS string literals. The generator
// JSON-encodes them, but we ALSO reject anything that could break out of a
// string literal as defense-in-depth: quotes, backtick, backslash, whitespace
// and control characters. Scopes additionally stick to the OAuth scope charset.
const SAFE_TOKEN_URL = /^[^'"`\\\s\x00-\x1f]+$/;
const SAFE_SCOPE = /^[\w:.\-/]+$/;

const upstreamAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('apiKey'),
    // Trim before checking length so a whitespace-only value is treated as
    // empty rather than passing as a "1-char" valid header name.
    headerName: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .min(1, 'header name required for API key auth')
          // HTTP header token charset, minus quotes and backtick: the name is
          // written into the generated kit (defense-in-depth, it is also JSON-encoded).
          .regex(/^[A-Za-z0-9!#$%&*+\-.^_|~]+$/, 'header name contains forbidden characters')
      ),
  }),
  z.object({ type: z.literal('bearer') }),
  z.object({
    type: z.literal('oauth2'),
    // client_credentials token endpoint — must be an absolute https URL with no
    // characters that could break out of a generated string literal.
    tokenUrl: z
      .string()
      .refine((value) => {
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      }, 'tokenUrl must be an absolute https URL')
      .refine((value) => SAFE_TOKEN_URL.test(value), 'tokenUrl contains forbidden characters'),
    scopes: z
      .array(z.string().refine((s) => SAFE_SCOPE.test(s), 'scope contains forbidden characters'))
      .optional(),
  }),
]);

const mcpServerTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{32}$/i, 'must be 32 hex characters');

export const sliceConfigSchema = z.object({
  mcpName: mcpNameSchema,
  baseUrl: baseUrlSchema,
  upstreamAuth: upstreamAuthSchema,
  // Pivot RC1.2/RC1.3 — mandatory hosting choice on screen 3.
  hosting: z.enum(['cloud', 'self']),
  mode: z.enum(['local', 'remote', 'both']),
  // Pivot RC1.4 — the token is auto-managed, never required from the user:
  // ignored in cloud (URL-secret / relay), auto-generated into the kit's
  // .env for self-host. Still validated as 32 hex chars when present.
  mcpServerToken: mcpServerTokenSchema.optional(),
  includeParamDescriptions: z.boolean(),
  retryOnServerError: z.boolean(),
});

export type SliceConfigInput = z.input<typeof sliceConfigSchema>;
export type SliceConfigOutput = z.output<typeof sliceConfigSchema>;

/**
 * Validator for the `/api/generate` payload (phase 08). Keeps the same
 * single source of truth as the config form. We don't re-validate the
 * `parsedSpec` shape here — it comes straight from our own parser, never
 * from arbitrary client input.
 */
export const generateRequestSchema = z.object({
  parsedSpec: z.object({}).passthrough(),
  rawSpec: z.string().min(1, 'rawSpec required'),
  selectedIds: z.array(z.string().min(1)).min(1, 'pick at least one endpoint'),
  config: sliceConfigSchema,
});

export type GenerateRequestInput = z.input<typeof generateRequestSchema>;

/**
 * Validator for "Save" on "Edit actions": only the selection of an MCP
 * changes (D3). Any other field — a name, an API's address, an upstream
 * access — refuses the whole change.
 */
export const mcpSelectionChangeSchema = z.strictObject(
  {
    fromVersion: z.number().int().positive(),
    selectedIds: z.array(z.string().min(1)).min(1, 'Pick at least one action.'),
  },
  {
    error: (issue) => (issue.code === 'unrecognized_keys' ? 'Only the selection of actions can be changed.' : undefined),
  }
);
