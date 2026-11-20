#!/usr/bin/env node
/**
 * What: Copies a stage folder forward to start the next stage: everything except node_modules,
 *     gen/ and build archives, with the package name and description updated.
 * Why: [CAP-AGENT] rule 2 - each stage is the previous stage extended, so `git diff --no-index
 *     stage-N stage-N+1` shows exactly what a topic adds. Doing the copy by script keeps it exact.
 * If missing or unlinked: Stages are copied by hand, stray build output or stale package names
 *     slip in, and npm workspaces fail with duplicate package names.
 *
 * Usage: npm run next-stage -- <from-folder> <to-folder> ["description"]
 */
import { cp, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SKIP = new Set(['node_modules', 'gen', 'mta_archives', 'coverage', 'resources']);

const [from, to, description] = process.argv.slice(2);
if (!from || !to) {
  console.error('Usage: npm run next-stage -- <from-folder> <to-folder> ["description"]');
  process.exit(2);
}
const src = path.join(root, from);
const dest = path.join(root, to);
try {
  await access(dest);
  console.error(`${to} already exists - refusing to overwrite.`);
  process.exit(2);
} catch {
  // expected: target does not exist yet
}

await cp(src, dest, {
  recursive: true,
  filter: (file) => !SKIP.has(path.basename(file)) && !file.endsWith('.mtar'),
});

const pkgFile = path.join(dest, 'package.json');
const pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
const number = /^stage-(\d+)/.exec(to)?.[1];
pkg.name = number ? `procurement-stage-${number}` : `procurement-${path.basename(to)}`;
if (description) pkg.description = description;
await writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Copied ${from} -> ${to} (package ${pkg.name}). Run npm install at the repo root.`);
