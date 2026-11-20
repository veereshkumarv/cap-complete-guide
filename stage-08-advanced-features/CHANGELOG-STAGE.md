<!--
What: Files added or changed in stage 08 compared with stage 07.
Why: [CAP-AGENT] rule 9 - learners see what attachments, change tracking, audit logging, outbox,
    replication and telemetry add.
If missing or unlinked: Readers must diff stage-07-data-persistence and this folder by hand.
-->

# CHANGELOG - stage 08 (advanced features)

Compare: `git diff --no-index stage-07-data-persistence stage-08-advanced-features`

| File | Change | Why |
|------|--------|-----|
| `package.json` | changed | `@cap-js/attachments`, `change-tracking`, `audit-logging`, `telemetry`; `cds.requires.messaging` (local + `queued`, Event Mesh in production); name, description |
| `db/extensions.cds` | added | supplier BP link (`bpNumber`, `blocked`, `bpLastChanged`, unique), `PurchaseOrders.attachments`, `Notifications` |
| `db/change-tracking.cds` | added | `@changelog` for orders and items; `@title` labels for the Change History |
| `db/data-privacy.cds` | added | `@PersonalData` for supplier contacts and suppliers |
| `db/undeploy.json` | added | written by `@cap-js/change-tracking` during `cds build` (HDI trigger cleanup) |
| `db/data/acme.procurement-Suppliers.csv` | changed | BP numbers, `blocked`, `bpLastChanged` (Kanto older than S/4HANA) |
| `db/data/sap.common-Countries.csv`, `_texts.csv` | changed | Sweden for the replicated partner Nordic Paper AB |
| `srv/integration-service.cds` | added | internal IntegrationService (`@protocol: 'none'`) |
| `srv/integration/integration-service.js` | added | message subscriptions, `replicateAll` |
| `srv/integration/bp-replication.js` | added | idempotent replication of one business partner |
| `srv/integration/approval-notifications.js` | added | idempotent consumer of `acme.procurement.PurchaseOrder.Approved.v1` |
| `srv/admin-service.cds`, `srv/admin-service.js` | changed / added | `replicateSuppliers` action (remote failures → 502 `REMOTE_UNAVAILABLE`) |
| `srv/procurement-service.cds` | changed | `Suppliers.blocked`, `Notifications`; imports `db/extensions` |
| `srv/procurement-service.js` | changed | outboxed message on approve, blocked-supplier rule, drafts-only creation guard |
| `srv/authorizations.cds` | changed | rules for attachments, notifications, `replicateSuppliers` |
| `app/procurement/annotations.cds`, `app/_i18n/*` | changed | `blocked` column in the supplier value help; labels |
| `_i18n/messages*.properties` | changed | `ORDER_DRAFT_ONLY`, `SUPPLIER_BLOCKED` (en, de) |
| `test/advanced.test.js` | added | 18 tests: change tracking, attachments, audit log, outbox, idempotency, replication, robustness, telemetry |
| `test/handlers.test.js` | changed | direct creation of active orders is rejected (was: total computed) |
| `test/perf/queries.bench.js` | changed | lint exception for the timing table |
| `test/requests.http` | extended | requests 29-39 |
| `../docs/images/stage-08-advanced-features-*.png` | added | Change History + Attachments screenshot |
| `../scripts/check-file-headers.js` | changed | `undeploy.json` exempt (plain JSON array) |
| all stages 02-08: `db/data/acme.procurement-PurchaseOrders.csv`, `test/actions.test.js` | fixed | seed total of PO-1000001 was 1309.70, its items sum to 1308.60 (found via the Change History) |
