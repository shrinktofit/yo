import { cpSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const subGenerators = ['app', 'package'];

for (const sub of subGenerators) {
  const src = resolve(dir, `../src/${sub}/templates`);
  const dest = resolve(dir, `../generators/${sub}/templates`);
  try {
    cpSync(src, dest, { recursive: true });
  } catch {
    // no templates for this sub-generator, skip
  }
}
