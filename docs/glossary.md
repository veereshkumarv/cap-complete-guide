<!--
What: Glossary of CAP / BTP terms used in the guide - a copy of Section 12 [CAP-S12] of
    CAP_DEVELOPMENT_GUIDE.md.
Why: [CAP-S04] / [CAP-S15] step 5 - a short, separately linkable lookup page for learners and for
    RAG retrieval (one chunk = one file).
If missing or unlinked: Readers must search the 900-line master guide for a term; links from the
    root README break.
-->

# Glossary

Source: [CAP_DEVELOPMENT_GUIDE.md - Section 12](../CAP_DEVELOPMENT_GUIDE.md#12-glossary--cap-s12).
Keep both in sync - the master guide wins on conflict.

| Term | Meaning |
|---|---|
| CDS | Core Data Services; CAP's modeling language |
| CQL | CDS Query Language (`SELECT.from(...)`) |
| CSN | Compiled model JSON ("Core Schema Notation") |
| cuid / managed | Aspects adding UUID key / audit fields (createdAt, createdBy, modifiedAt, modifiedBy) |
| Composition | Parent-owned child relationship (cascading lifecycle) |
| Association | Reference relationship |
| Projection | Service entity derived from a DB entity |
| Draft | Server-side saved work-in-progress edit state (Fiori) |
| Bound action | Action on a single entity instance |
| Handler | Function registered via `before/on/after` |
| Outbox | Transactional persistent queue for outgoing messages/calls |
| HDI | HANA Deployment Infrastructure container |
| MTA / mbt | Multitarget application descriptor / build tool |
| MTX | Multitenancy and extensibility library `@sap/cds-mtxs` |
| XSUAA | BTP authorization & trust service (CF) |
| IAS | SAP Cloud Identity Services – Authentication |
| Approuter | Entry point that handles auth and routes to services/UI |
| Fiori Elements | Metadata/annotation-driven UI framework |
| Floorplan | Standard Fiori page type (List Report, Object Page, …) |
