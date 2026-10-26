// WAT-152 — a program a test starts through tsx must not outlive the test.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { startTestProcess, stopTestProcess } from './test-processes';

const TSX = path.resolve('node_modules/.bin/tsx');
const dir = mkdtempSync(path.join(tmpdir(), 'slice-test-processes-'));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A program that prints its own pid and stays alive, optionally deaf to SIGTERM. */
function writeProgram(name: string, ignoreTerm: boolean): string {
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `${ignoreTerm ? "process.on('SIGTERM', () => {});\n" : ''}console.log(process.pid);\nsetInterval(() => {}, 1000);\n`
  );
  return file;
}

/** The pid the program printed: tsx runs it in a child process of its own. */
function programPid(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.stdout!.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
    child.once('exit', (code) => reject(new Error(`exited early (${code})`)));
  });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function goneWithin(pid: number, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 50) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isAlive(pid);
}

describe('a program a test starts through tsx', () => {
  it('is gone once the test stops it with SIGKILL, though tsx runs it in a child of its own', async () => {
    const child = startTestProcess(TSX, [writeProgram('alive.ts', false)], { stdio: ['ignore', 'pipe', 'ignore'] });
    const pid = await programPid(child);
    expect(pid).not.toBe(child.pid);

    await stopTestProcess(child, 'SIGKILL');

    expect(await goneWithin(pid, 2_000)).toBe(true);
  }, 30_000);

  it('is gone once the test stops it, even when it ignores SIGTERM', async () => {
    const child = startTestProcess(TSX, [writeProgram('deaf.ts', true)], { stdio: ['ignore', 'pipe', 'ignore'] });
    const pid = await programPid(child);

    await stopTestProcess(child);

    expect(await goneWithin(pid, 2_000)).toBe(true);
  }, 30_000);
});
