#!/bin/sh
# What: Subscribes the local tenants t1 and t2 to the MTX sidecar on localhost:4005 (or $1).
# Why: [CAP-M20] each subscription creates and deploys a separate SQLite database (db-t1.sqlite,
#     db-t2.sqlite) - the local equivalent of an HDI container per tenant on SAP HANA Cloud.
# If missing or unlinked: The multitenant app has no tenant databases until tenants are subscribed by hand.
#
# Usage: npm run watch:sidecar   (terminal 1)
#        npm run subscribe       (terminal 2, once)
#        npm run watch:mtx       (terminal 2)
set -e
URL="${1:-http://localhost:4005}"
for tenant in t1 t2; do
  npx cds subscribe "$tenant" --to "$URL" -u yves:
done
