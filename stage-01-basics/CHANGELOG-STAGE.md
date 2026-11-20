<!--
What: Files added in stage 01 compared with an empty `cds init` project.
Why: [CAP-AGENT] rule 9 - every stage lists its changes so learners see exactly what a topic adds.
If missing or unlinked: Readers must diff folders by hand to find what the stage introduced.
-->

# CHANGELOG - stage 01 (basics)

Baseline: output of `cds init procurement` (folders `app/ db/ srv/`, `readme.md`, `.gitignore`).

| File | Change | Why |
|------|--------|-----|
| `package.json` | added | CAP 10 `cds init` writes none; scripts + dependencies |
| `db/schema.cds` | added | `Products` entity |
| `db/data/acme.procurement-Products.csv` | added | 5 sample products |
| `srv/catalog-service.cds` | added | read-only `CatalogService` |
| `test/smoke.test.js` | added | acceptance test |
| `README.md` | replaces `readme.md` | guide template (Section 8) |
| `.gitignore` | extended | adds `gen/`, `*.mtar`, `default-env.json`, `.env` |
