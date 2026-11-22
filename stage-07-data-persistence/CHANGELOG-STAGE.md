<!--
What: Files added or changed in stage 07 compared with stage 06.
Why: [CAP-AGENT] rule 9 - learners see exactly what HANA persistence, search and paging add.
If missing or unlinked: Readers must diff stage-06-security and this folder by hand.
-->

# CHANGELOG - stage 07 (data persistence)

Compare: `git diff --no-index stage-06-security stage-07-data-persistence`

| File | Change | Why |
|------|--------|-----|
| `package.json` | changed | `@cap-js/hana` (by `cds add hana`) → HANA in production; scripts `build`, `perf`; name, description |
| `srv/query-options.cds` | added | `@cds.search` for orders, suppliers, products; `@cds.query.limit` (50 / 200) for both services |
| `db/src/PurchaseOrders_owner_status.hdbindex` | added | native HANA index on (createdBy, status) - the instance-based restriction of stage 06 |
| `db/src/.hdiconfig` | added | maps `.hdbindex` to `com.sap.hana.di.index` |
| `docs/hana-notes.md` | added | build output, hybrid testing, SQLite vs HANA, schema evolution, indexing |
| `test/persistence.test.js` | added | 8 tests: search, paging, production DB kind, `cds build --production` output |
| `test/perf/queries.bench.js` | added | `npm run perf` - typical queries on 20,000 generated orders |
| `test/requests.http` | extended | requests 25-28 (search, paging) |
| `../scripts/check-file-headers.js` | changed | `.hdiconfig` exempt from headers (strict JSON) |
| `../scripts/copy-stage.js` | changed | never copies `default-env.json`, `.cdsrc-private.json`, `.env` to the next stage |
| `test/guardrails.test.js` and the files it covers | added / fixed later | 11 regression tests for the fixes of the [security and code review](../docs/security-guardrails.md) (applied to every stage where the code exists) |
