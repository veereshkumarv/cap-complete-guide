#!/bin/sh
# What: Builds the deployable MTA archive (mta_archives/acme-procurement_<version>.mtar) with the
#     Cloud MTA Build Tool, from a clean copy of this folder.
# Why: [CAP-M22] / [CAP-STAGE-10] `mbt build` runs `npm ci` in every module, which needs a lock file
#     per project. Inside the guide repository this stage shares the root lock file (npm workspaces),
#     so the script copies the folder, creates a stand-alone lock file there and builds - the same
#     result as in a repository that contains only this app.
# If missing or unlinked: `mbt build` in place fails with "npm ci can only install with an existing
#     package-lock.json", and there is nothing to deploy.
#
# Usage: npm run build:mtar     (needs network access for npm and the mbt binary)
set -eu
STAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$STAGE_DIR/mta_archives"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
WORK="$TMP_ROOT/app"

# copy without dependencies, build output, local databases and local credentials
# (via a file, not a pipe: POSIX sh has no pipefail, a failing first tar would go unnoticed)
tar -C "$STAGE_DIR" \
  --exclude=node_modules --exclude=gen --exclude=mta_archives --exclude=dist \
  --exclude='*.sqlite*' --exclude=default-env.json --exclude=.cdsrc-private.json --exclude='.env*' \
  -cf "$TMP_ROOT/app.tar" .
mkdir -p "$WORK" && tar -C "$WORK" -xf "$TMP_ROOT/app.tar"

cd "$WORK"
[ -f package-lock.json ] || npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npx --yes mbt@1 build -t "$OUT"
ls -l "$OUT"
