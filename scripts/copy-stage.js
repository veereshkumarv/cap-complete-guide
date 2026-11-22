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
// Build output and local credential files ([CAP-S09]: no secrets) never travel to the next stage.
const SKIP = new Set(['node_modules', 'gen', 'mta_archives', 'coverage', 'resources', 'default-env.json', '.cdsrc-private.json', '.env']);

const [from, to, description] = process.argv.slice(2);
if (!from || !to) {
  console.error('Usage: npm run next-stage -- <from-folder> <to-folder> ["description"]');
  process.exit(2);
}
const src = path.join(root, from);
const dest = path.join(root, to);
// only folders directly inside the repository (no ../ escapes)
for (const p of [src, dest]) {
  if (path.dirname(p) !== root && path.dirname(path.dirname(p)) !== root) {
    console.error(`${path.relative(root, p)} is not a folder of this repository - refusing.`);
    process.exit(2);
  }
}
try {
  await access(dest);
  console.error(`${to} already exists - refusing to overwrite.`);
  process.exit(2);
} catch {
  // expected: target does not exist yet
}

// local databases, logs and credential variants (.env.local, ...) are never part of a stage
const SKIP_PATTERN = /\.(mtar|sqlite|sqlite-\w+|db|log)$|^\.env\./;
await cp(src, dest, {
  recursive: true,
  filter: (file) => !SKIP.has(path.basename(file)) && !SKIP_PATTERN.test(path.basename(file)),
});

const pkgFile = path.join(dest, 'package.json');
const pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
const number = /^stage-(\d+)/.exec(to)?.[1];
pkg.name = number ? `procurement-stage-${number}` : `procurement-${path.basename(to)}`;
if (description) pkg.description = description;
// The "//" header names the stage it belongs to; point it at the new stage so it is not carried forward stale.
const title = /^stage-\d+-(.+)$/.exec(to)?.[1]?.replace(/-/g, ' ');
if (number && title && Array.isArray(pkg['//'])) {
  pkg['//'][0] = pkg['//'][0].replace(/stage \d+ \([^)]*\)/, `stage ${number} (${title})`);
}
await writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Copied ${from} -> ${to} (package ${pkg.name}). Run npm install at the repo root.`);
