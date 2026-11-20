<!--
What: Files added or changed in stage 02 compared with stage 01.
Why: [CAP-AGENT] rule 9 - learners see exactly what domain modelling adds to the basic project.
If missing or unlinked: Readers must diff stage-01-basics and this folder by hand.
-->

# CHANGELOG - stage 02 (domain modeling)

Compare: `git diff --no-index stage-01-basics stage-02-domain-modeling`

| File | Change | Why |
|------|--------|-----|
| `db/schema.cds` | rewritten | full ACME model: Suppliers, SupplierContacts, Categories, Products, POStatus, PurchaseOrders, PurchaseOrderItems, ApprovalLog |
| `db/data/acme.procurement-*.csv` | 9 files | 5 suppliers, 6 contacts, 4 categories, 10 products, 4 orders, 5 items, 2 approval log entries |
| `db/data/*_texts.csv` | 4 files added | German texts for products, categories, countries, currencies |
| `db/data/sap.common-Countries*.csv`, `sap.common-Currencies*.csv` | added | code-list content for `Country` / `Currency` |
| `db/data/acme.procurement-Products.csv` | replaced | new keys and `category_code`, `currency_code` columns |
| `srv/catalog-service.cds` | changed | also exposes `Categories` |
| `test/smoke.test.js` | removed | replaced by `test/model.test.js` |
| `test/model.test.js` | added | SQL, data, calculated element, localization, cascade tests |
| `package.json` | name/description | `procurement-stage-02` |
