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
const workflow = yaml.load(readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8')) as Workflow;
const gate = workflow.jobs.gate;

/** The gate's step whose command starts with `command`. */
const stepRunning = (command: string): Step | undefined =>
  gate.steps.find((step) => step.run?.trim().startsWith(command));

describe('the CI', () => {
  it('builds the image of the Dockerfile on every pull request and every push to main', () => {
    expect(workflow.on.pull_request).not.toBeUndefined();
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(stepRunning('docker build')).not.toBeUndefined();
  });
});
