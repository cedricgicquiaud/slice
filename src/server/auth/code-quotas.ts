/**
 * How many sign-in codes may leave in an hour (D13): five for an address, ten
 * from an IP. Only codes that left count: a failed send spends nothing
 * (contract 14). Kept in memory: a restart gives every quota back.
 */
const HOUR_MS = 60 * 60 * 1000;
const CODES_PER_ADDRESS = 5;
const CODES_PER_IP = 10;

export type CodeQuota = 'address' | 'ip';

export function createCodeQuotas() {
  /** When codes left, by `address:` or `ip:` key. */
  const sent = new Map<string, number[]>();
  const sentWithinHour = (key: string) => (sent.get(key) ?? []).filter((at) => Date.now() - at < HOUR_MS);

  return {
    /** The quota a new code for `email` from `ip` would exceed, if any; an unknown IP has none. */
    exceeded(email: string, ip: string | null): CodeQuota | undefined {
      if (sentWithinHour(`address:${email}`).length >= CODES_PER_ADDRESS) return 'address';
      if (ip && sentWithinHour(`ip:${ip}`).length >= CODES_PER_IP) return 'ip';
      return undefined;
    },
    /** Counts a code that left for `email` from `ip`. */
    count(email: string, ip: string | null) {
      const keys = ip ? [`address:${email}`, `ip:${ip}`] : [`address:${email}`];
      for (const key of keys) sent.set(key, [...sentWithinHour(key), Date.now()]);
    },
  };
}
