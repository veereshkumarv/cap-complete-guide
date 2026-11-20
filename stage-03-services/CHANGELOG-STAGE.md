<!--
What: Files added or changed in stage 03 compared with stage 02.
Why: [CAP-AGENT] rule 9 - learners see what use-case services and draft add to the domain model.
If missing or unlinked: Readers must diff stage-02-domain-modeling and this folder by hand.
-->

# CHANGELOG - stage 03 (services)

Compare: `git diff --no-index stage-02-domain-modeling stage-03-services`

| File | Change | Why |
|------|--------|-----|
| `srv/procurement-service.cds` | added | requester service, draft-enabled `PurchaseOrders` |
| `srv/admin-service.cds` | added | master-data service for buyers/admins |
| `srv/catalog-service.cds` | removed | replaced by use-case services (CAP-DEC-01) |
| `test/service.test.js` | added | metadata, `$expand`, draft round trip, deep insert |
| `test/requests.http` | added | clickable sample requests |
| `test/model.test.js` | removed | model is unchanged and covered in stage 02 |
| `package.json` | name/description | `procurement-stage-03` |
