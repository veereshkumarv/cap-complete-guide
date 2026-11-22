<!--
What: Files added or changed in stage 04 compared with stage 03.
Why: [CAP-AGENT] rule 9 - learners see what custom logic, actions, events and remote services add.
If missing or unlinked: Readers must diff stage-03-services and this folder by hand.
-->

# CHANGELOG - stage 04 (custom logic)

Compare: `git diff --no-index stage-03-services stage-04-custom-logic`

| File | Change | Why |
|------|--------|-----|
| `srv/procurement-service.cds` | changed | bound actions `submit/approve/reject/send/reopen`, function `topSuppliers`, event `POApproved`, entity `RemoteSuppliers` |
| `srv/procurement-service.js` | added | handlers: number + defaults on NEW, price defaulting, live totals, action logic, event consumer, remote delegation |
| `srv/lib/status.js` | added | state machine table |
| `srv/lib/number-range.js` | added | sequential, collision-free order numbers (discarded drafts leave gaps) |
| `srv/lib/totals.js` | added | item sum and total recalculation |
| `db/number-ranges.cds`, `db/data/acme.procurement-NumberRanges.csv` | added | number range table + start value |
| `srv/external/API_BUSINESS_PARTNER.edmx` | added | S/4HANA Business Partner metadata (subset) |
| `srv/external/API_BUSINESS_PARTNER.cds` | generated | `cds import ... --as cds` |
| `srv/external/data/*.csv` | added | mock data for the remote API |
| `package.json` | changed | `cds.requires.API_BUSINESS_PARTNER` (by `cds import`) + `[production]` destination; SAP Cloud SDK dependencies (by `cds import`) |
| `_i18n/messages.properties`, `messages_de.properties` | added | localized error messages |
| `test/actions.test.js`, `handlers.test.js`, `remote.test.js`, `units.test.js` | added | 21 tests |
| `test/service.test.js` | removed | draft basics are covered in stage 03 |
| `test/requests.http` | extended | actions, function, remote requests |
| `test/guardrails.test.js` and the files it covers | added / fixed later | 9 regression tests for the fixes of the [security and code review](../docs/security-guardrails.md) (applied to every stage where the code exists) |
