<!--
What: Notes for running ACME Procurement on SAP HANA Cloud: how the HDI deployment module is built,
    how to deploy and test in hybrid mode, differences between SQLite and HANA, schema evolution
    (data-loss risks) and indexing.
Why: [CAP-STAGE-07] requires docs/hana-notes.md; these are the things that work on SQLite and then
    fail or behave differently on HANA.
If missing or unlinked: Learners meet the SQLite/HANA differences for the first time in production.
-->

# SAP HANA Cloud notes (stage 07)

## 1. What `cds build --production` produces

```
gen/
├─ db/                                   # HDI deployer app (deployed as a CF task / MTA module)
│  ├─ package.json                       # @sap/hdi-deploy + hdb, start = deploy.js
│  └─ src/
│     ├─ .hdiconfig                      # from db/src: plugin for .hdbindex
│     ├─ PurchaseOrders_owner_status.hdbindex   # native artefact, copied from db/src
│     └─ gen/
│        ├─ .hdiconfig, .hdinamespace    # plugins for generated artefacts
│        ├─ acme.procurement.*.hdbtable  # one per entity
│        ├─ ProcurementService.*.hdbview # one per projection; drafts as *_drafts.hdbtable
│        ├─ localized.*.hdbview          # language fallback views for `localized` elements
│        └─ data/*.csv + *.hdbtabledata  # initial data from db/data
└─ srv/                                  # Node.js app with the compiled model (csn.json), @cap-js/hana
```

The test `test/persistence.test.js` runs this build and checks the important files.

## 2. Hybrid testing (manual - needs a BTP subaccount with SAP HANA Cloud)

```sh
cf login -a <api-endpoint> --sso                # Cloud Foundry space with HANA Cloud entitlement
cf create-service hana hdi-shared procurement-db
npx cds deploy --to hana:procurement-db         # builds, deploys the HDI container, stores the binding
                                                # in .cdsrc-private.json (git-ignored) for profile hybrid
npx cds watch --profile hybrid                  # local CAP server, data in HANA Cloud
```

Optional (not verified in this repository - no BTP access while writing): run the performance check
against HANA with `npx cds bind --exec --profile hybrid -- npm run perf`. It **inserts 80,000 test
rows** into the container - use a throwaway HDI container, never a shared one.

Clean up with `cf delete-service-key procurement-db <key>` and `cf delete-service procurement-db`.

## 3. SQLite (development) vs SAP HANA (production)

| Topic | SQLite | SAP HANA | Consequence |
|-------|--------|----------|-------------|
| String length | `String(20)` not enforced | `NVARCHAR(20)` enforced - longer values fail | validate lengths (`@assert.format`, handlers); test with HANA |
| Decimals | stored as floating point/text | exact `DECIMAL(p,s)` | compute money in exact arithmetic (`srv/lib/totals.js`); never compare floats |
| Identifiers | case-insensitive | unquoted names upper-cased (`ACME_PROCUREMENT_PURCHASEORDERS`) | native SQL / `.hdb*` files use upper case |
| Locking | whole database, one connection in dev | row locks, connection pool | the number-range row is a real hot spot only on HANA |
| Isolation | serializable | read committed | parallel requests can see committed changes of others |
| Sorting / comparison | binary, `LIKE` ASCII case-insensitive | binary, case-sensitive | use `$search` / CQL `contains` (CAP normalises) instead of raw `LIKE` |
| SQL functions | SQLite functions | HANA functions | stick to CQL/OData standard functions; native SQL only in `db/src` |
| Native artefacts | not supported | `.hdbindex`, `.hdbview`, calculation views, procedures | dev and prod diverge - keep them few ([CAP-DEC-08]) |
| Schema changes | in-memory: rebuilt on every start | HDI migrates existing tables | see section 4 |
| Timestamps | ISO strings, ms | `TIMESTAMP`, 100 ns | compare with care in tests |

## 4. Schema evolution - data-loss warning

HDI compares the new `.hdbtable` with the deployed table and migrates the data:

| Change | Result |
|--------|--------|
| add an element / entity | `ALTER TABLE ... ADD` - safe |
| make a `String` longer, `Decimal` larger | safe |
| rename an element | **old column dropped, new one empty** - data lost |
| remove an element | **column dropped** - data lost |
| shorten a `String`, change type incompatibly | deployment fails or truncates |
| remove an entity | table stays until listed in `db/undeploy.json` |

Protect important tables:

- `@cds.persistence.journal` on an entity makes `cds build` generate an `.hdbmigrationtable`
  (explicit, versioned `ALTER` statements instead of copy-and-replace).
- Rename in two steps: add the new element, copy data (migration script or handler), deploy, then
  remove the old one.
- Always test the deployment against a copy of production data before going live.

## 5. Indexing guidance

- Primary keys are indexed automatically; HANA's column store makes many classic indexes
  unnecessary - add one only for a **measured** slow, selective predicate on a large table.
- Foreign keys are **not** indexed automatically; navigation (`items`, `supplier`) on very large
  tables can profit from an index on `parent_ID` / `supplier_ID`.
- Columns used in instance-based restrictions (`createdBy`, `status`, stage 06) are filtered on
  every request of a requester - hence `db/src/PurchaseOrders_owner_status.hdbindex`.
- CDS has no index syntax; indexes are native `.hdbindex` files in `db/src` (with a `.hdiconfig`
  that maps the suffix to `com.sap.hana.di.index`).
- Measure with `EXPLAIN PLAN` / SQL Analyzer in SAP HANA Database Explorer, with production-like
  volumes (`npm run perf` in hybrid mode).
