/**
 * Test support — starting and stopping a program a test runs (the server, a generated MCP).
 * tsx runs the program in a child process of its own: signalling tsx alone, SIGKILL above all,
 * leaves that child running with no parent (624 of them on 26/10, WAT-152). So each program
 * starts in a process group of its own, stopping it signals the whole group, and a group still
 * running when the test worker exits is killed with it.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

/** How long a program gets to stop on its own before the whole group is killed. */
const STOP_GRACE_MS = 5_000;

const runningGroups = new Set<number>();
process.once('exit', () => {
  for (const pid of runningGroups) killGroup(pid, 'SIGKILL');
});

export function startTestProcess(command: string, args: string[], options: SpawnOptions): ChildProcess {
  const child = spawn(command, args, { ...options, detached: true });
  const pid = child.pid;
  if (pid !== undefined) runningGroups.add(pid);
  return child;
}

/** Stop the program and everything it started; resolves once the program has exited. */
export function stopTestProcess(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(grace);
      killGroup(pid, 'SIGKILL');
      runningGroups.delete(pid);
      resolve();
    };
    const grace = setTimeout(done, STOP_GRACE_MS);
    if (child.exitCode !== null || child.signalCode !== null) return done();
    child.once('exit', done);
    killGroup(pid, signal);
  });
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // the group is already gone
  }
}
