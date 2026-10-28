import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

interface Step {
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Job {
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  steps: Step[];
}

interface Workflow {
  on: { pull_request?: unknown; push?: { branches?: string[] } };
  jobs: Record<string, Job>;
}

const ROOT = resolve(import.meta.dirname, '..');
const ciFile = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
const workflow = yaml.load(ciFile) as Workflow;
const gate = workflow.jobs.gate;

/** The gate's step with a line of its script that starts with `command`. */
const stepRunning = (command: string): Step | undefined =>
  gate.steps.find((step) => step.run?.split('\n').some((line) => line.trim().startsWith(command)));

describe('the CI', () => {
  it('builds the image of the Dockerfile on every pull request and every push to main', () => {
    expect(workflow.on.pull_request).not.toBeUndefined();
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(stepRunning('docker build')).not.toBeUndefined();
  });

  it('gives the image its start-up settings when it runs', () => {
    const settings = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'SLICE_ENCRYPTION_KEY'];
    const passed = stepRunning('docker run')?.run?.match(/-e\s+[A-Z_]+/g) ?? [];
    expect(passed.map((flag) => flag.split(/\s+/)[1])).toEqual(expect.arrayContaining(settings));
  });

  it('fails unless the image it started answers 200 to GET / and GET /api/health', () => {
    const started = gate.steps.indexOf(stepRunning('docker run')!);
    const check = gate.steps.slice(started + 1).find((step) => step.run?.includes('localhost:3001'))?.run ?? '';
    expect(check).toContain('for path in /api/health /; do');
    expect(check).toContain('[ "$status" = 200 ] || { docker logs slice; exit 1; }');
  });

  it('hands no build argument to the image', () => {
    expect(ciFile).not.toContain('--build-arg');
  });
});
