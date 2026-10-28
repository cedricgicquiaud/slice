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

describe('the Dockerfile', () => {
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
});
