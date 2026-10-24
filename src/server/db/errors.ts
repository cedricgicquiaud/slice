/**
 * Tells an unreachable database (an outage: answer 503, it will come back)
 * from any other storage error (a bug: answer 500). Drizzle wraps the driver's
 * error in `cause`, so the whole chain is inspected.
 */

/** Network failures reported by Node while reaching the database server. */
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE']);

/** PostgreSQL SQLSTATE: class 08 is "connection exception"; 57P01-03 mean the server is shutting down or starting. */
const POSTGRES_UNAVAILABLE = /^(08...|57P0[123])$/;

/** Driver messages that carry no code: dropped or never-obtained pool connection, closed PGlite. */
const UNREACHABLE_MESSAGES = [
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /cannot use a pool after calling end/i,
  /pglite is closed/i,
];

export function isDatabaseUnreachable(err: unknown): boolean {
  for (let current = err, depth = 0; current instanceof Error && depth < 10; current = current.cause, depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && (NETWORK_CODES.has(code) || POSTGRES_UNAVAILABLE.test(code))) return true;
    if (UNREACHABLE_MESSAGES.some((pattern) => pattern.test(current.message))) return true;
  }
  return false;
}
