// Test helpers: load the WASM core in Node and read the shared fixtures.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCore } from './index';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const FIXTURES = join(REPO_ROOT, 'fixtures');

export function loadCore(): void {
  void initCore(readFileSync(new URL('./pkg/fairisle_core_bg.wasm', import.meta.url)));
}

export interface Fixture {
  name: string;
  dir: string;
  input: string;
  expected: Record<string, unknown>;
}

export function fixtures(): Fixture[] {
  return readdirSync(FIXTURES)
    .filter((name) => statSync(join(FIXTURES, name)).isDirectory())
    .sort()
    .map((name) => {
      const dir = join(FIXTURES, name);
      const inputFile = readdirSync(dir).find((f) => f.startsWith('input.'));
      if (!inputFile) throw new Error(`${name}: no input file`);
      return {
        name,
        dir,
        input: readFileSync(join(dir, inputFile), 'utf8'),
        expected: JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')),
      };
    });
}

export function fixtureText(name: string): string {
  return fixtures().find((f) => f.name === name)!.input;
}
