/**
 * How many sign-in codes may leave in an hour (D13): five for an address, ten
 * from an IP. Only codes that left count: a failed send spends nothing
 * (contract 14). Kept in memory: a restart gives every quota back.
 * Requests whose IP cannot be read share one IP's quota, so that a forged
 * `x-forwarded-for` cannot slip past it.
 */
const HOUR_MS = 60 * 60 * 1000;
const CODES_PER_ADDRESS = 5;
const CODES_PER_IP = 10;
const UNKNOWN_IP = 'unknown';

export type CodeQuota = 'address' | 'ip';

export function createCodeQuotas() {
  /** When codes left, by `address:` or `ip:` key. */
  const sent = new Map<string, number[]>();
  const sentWithinHour = (key: string) => (sent.get(key) ?? []).filter((at) => Date.now() - at < HOUR_MS);

  return {
    /** The quota a new code for `email` from `ip` would exceed, if any. */
    exceeded(email: string, ip: string | null): CodeQuota | undefined {
      if (sentWithinHour(`address:${email}`).length >= CODES_PER_ADDRESS) return 'address';
      if (sentWithinHour(`ip:${ip ?? UNKNOWN_IP}`).length >= CODES_PER_IP) return 'ip';
      return undefined;
    },
    /** Counts a code that left for `email` from `ip`. */
    count(email: string, ip: string | null) {
      for (const key of [`address:${email}`, `ip:${ip ?? UNKNOWN_IP}`]) sent.set(key, [...sentWithinHour(key), Date.now()]);
    },
  };
}
