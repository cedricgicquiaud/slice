/**
 * Test support — starting and stopping a program a test runs (the server, a generated MCP).
 * Not implemented yet (WAT-152, red).
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export function startTestProcess(command: string, args: string[], options: SpawnOptions): ChildProcess {
  return spawn(command, args, options);
}

export function stopTestProcess(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill(signal);
  });
}
