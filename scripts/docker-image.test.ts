import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8');

interface Instruction {
  keyword: string;
  args: string;
}

/** The Dockerfile's instructions, comments dropped and `\` continuations joined. */
function instructionsOf(dockerfile: string): Instruction[] {
  return dockerfile
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [keyword, ...rest] = line.split(/\s+/);
      return { keyword: keyword.toUpperCase(), args: rest.join(' ') };
    });
}

/** Production secrets: given to the container when it starts, never to the image (D11). */
const SECRETS = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'SLICE_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_SECRET',
];

/** The variables an ARG or ENV instruction declares: `ARG A=1`, `ENV A=1 B=2`, or `ENV A 1`. */
function declaredNames({ keyword, args }: Instruction): string[] {
  if (keyword === 'ARG') return args.split(/\s+/).map((arg) => arg.split('=')[0]);
  if (keyword !== 'ENV') return [];
  const assigned = [...args.matchAll(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=/g)].map((m) => m[1]);
  return assigned.length > 0 ? assigned : [args.split(/\s+/)[0]];
}

const secretsDeclaredIn = (dockerfile: string): string[] =>
  instructionsOf(dockerfile)
    .flatMap(declaredNames)
    .filter((name) => SECRETS.includes(name));

describe('the Dockerfile', () => {
  it('declares none of the production secrets, neither as ARG nor as ENV', () => {
    expect(secretsDeclaredIn(read('Dockerfile'))).toEqual([]);
  });

  it('would be caught declaring ARG DATABASE_URL or ENV BETTER_AUTH_SECRET', () => {
    const leaking = 'FROM node:22\nARG DATABASE_URL\nENV PORT=3001 BETTER_AUTH_SECRET=x\n';
    expect(secretsDeclaredIn(leaking)).toEqual(['DATABASE_URL', 'BETTER_AUTH_SECRET']);
  });

  it('needs no build argument to build', () => {
    expect(instructionsOf(read('Dockerfile')).filter((i) => i.keyword === 'ARG')).toEqual([]);
  });

  it('builds SLICE like pnpm build, from the frozen lockfile', () => {
    const runs = instructionsOf(read('Dockerfile'))
      .filter((i) => i.keyword === 'RUN')
      .map((i) => i.args);
    expect(runs).toEqual(expect.arrayContaining(['pnpm install --frozen-lockfile', 'pnpm build']));
  });

  it('starts SLICE like pnpm start, from the folder that holds package.json and the built dist/', () => {
    const instructions = instructionsOf(read('Dockerfile'));
    const lastStage = instructions.slice(instructions.findLastIndex((i) => i.keyword === 'FROM'));
    const cmd = lastStage.find((i) => i.keyword === 'CMD');
    expect(cmd && JSON.parse(cmd.args)).toEqual(['pnpm', 'start']);
    expect(lastStage.map((i) => `${i.keyword} ${i.args}`)).toContain('COPY --from=build /app/dist ./dist');
  });
});

/** The patterns of an ignore file, comments and blank lines dropped. */
const patternsOf = (ignoreFile: string): string[] =>
  ignoreFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

describe('the files kept out', () => {
  it('keeps .env and data/ out of the image', () => {
    expect(patternsOf(read('.dockerignore'))).toEqual(expect.arrayContaining(['.env', 'data/']));
  });

  it('keeps .env out of the repository', () => {
    expect(patternsOf(read('.gitignore'))).toContain('.env');
  });
});
