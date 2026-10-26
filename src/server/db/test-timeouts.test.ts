// WAT-113 — under the full suite, starting a database outgrows Vitest's 5 s default.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTS_A_DATABASE = /new PGlite\(|createTestDatabase\(|openDatabase\(|createTestAccount\(/;
const TIMEOUTS_SET = 'vi.setConfig(DATABASE_TEST_TIMEOUTS)';

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('test files that start a database', () => {
  it('give their tests and hooks the 30 s database timeouts', () => {
    const missing = testFiles(serverDir)
      .filter((file) => STARTS_A_DATABASE.test(readFileSync(file, 'utf-8')))
      .filter((file) => !readFileSync(file, 'utf-8').includes(TIMEOUTS_SET))
      .map((file) => path.relative(serverDir, file));
    expect(missing).toEqual([]);
  });
});
