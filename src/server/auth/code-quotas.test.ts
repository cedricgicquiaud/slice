// WAT-99 — the ten codes an hour from an IP hold even when the IP cannot be read.
// Out of production Better Auth reads an unreadable `x-forwarded-for` as
// 127.0.0.1, so this case is only reachable here, on the quotas themselves.
import { describe, it, expect } from 'vitest';
import { createCodeQuotas } from './code-quotas';

describe('requests whose IP is unknown (contract 22)', () => {
  it('share the ten codes an hour of one IP, whatever the address', () => {
    const quotas = createCodeQuotas();
    for (let i = 1; i <= 10; i++) quotas.count(`spoof${i}@example.com`, null);

    expect(quotas.exceeded('spoof11@example.com', null)).toBe('ip');
  });

  it('leave the ten codes of a known IP untouched', () => {
    const quotas = createCodeQuotas();
    for (let i = 1; i <= 10; i++) quotas.count(`spoof${i}@example.com`, null);

    expect(quotas.exceeded('office@example.com', '203.0.113.7')).toBeUndefined();
  });
});
