#!/bin/sh
# What: Deploys the newest MTA archive (or the one given as $1) to the Cloud Foundry space you are
#     logged in to, after checking the cf CLI, the MultiApps plugin and the login target.
#     STRATEGY=blue-green switches to a zero-downtime blue-green deployment.
# Why: [CAP-M22] / [CAP-STAGE-10] the same command for every environment and every person; the
#     checks turn the usual first-time errors into clear messages.
# If missing or unlinked: Deployments are typed by hand, with varying options and no pre-flight checks.
#
# Usage: cf login -a <api> --sso && npm run deploy
#        STRATEGY=blue-green npm run deploy
#        npm run deploy -- mta_archives/procurement-stage-10_1.0.0.mtar
set -eu
STAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MTAR="${1:-$(ls -t "$STAGE_DIR"/mta_archives/*.mtar 2>/dev/null | head -1)}"

command -v cf >/dev/null 2>&1 || { echo "cf CLI not found - https://github.com/cloudfoundry/cli#downloads"; exit 1; }
cf plugins | grep -q multiapps || { echo "MultiApps plugin missing - run: cf install-plugin multiapps"; exit 1; }
cf target >/dev/null 2>&1 || { echo "Not logged in - run: cf login -a <api-endpoint> --sso"; exit 1; }
[ -n "$MTAR" ] && [ -f "$MTAR" ] || { echo "No .mtar found - run: npm run build:mtar"; exit 1; }

echo "Deploying $MTAR to: $(cf target | grep -E 'org|space' | tr -s ' ' | tr '\n' ' ')"
if [ "${STRATEGY:-}" = "blue-green" ]; then
  cf deploy "$MTAR" --strategy blue-green -f
else
  cf deploy "$MTAR" -f
fi
