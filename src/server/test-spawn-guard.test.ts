// WAT-152 — a test that spawns a program directly leaves it running once the test is cut short.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const SPAWNS_DIRECTLY = /import\s*\{[^}]*\bspawn\b[^}]*\}\s*from\s*'node:child_process'/;

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('test files that start a program', () => {
  it('start it with startTestProcess, never with spawn', () => {
    const direct = testFiles(serverDir)
      .filter((file) => SPAWNS_DIRECTLY.test(readFileSync(file, 'utf-8')))
      .map((file) => path.relative(serverDir, file));
    expect(direct).toEqual([]);
  });
});
