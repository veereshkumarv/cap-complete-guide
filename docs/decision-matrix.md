<!--
What: Decision matrix "when to use / avoid / impact" for CAP features plus the index of decision
    rules [CAP-DEC-xx] - a copy of Sections 13 and 11.3 of CAP_DEVELOPMENT_GUIDE.md.
Why: [CAP-S04] / [CAP-S15] step 5 - architects need the trade-offs on one page without reading the
    module chapters.
If missing or unlinked: Design decisions are taken without the documented trade-offs; links from the
    root README break.
-->

# Decision matrix

Source: [CAP_DEVELOPMENT_GUIDE.md - Sections 13 and 11.3](../CAP_DEVELOPMENT_GUIDE.md#13-decision-matrix-when-to-use--impact--cap-s13).
Keep both in sync - the master guide wins on conflict.

## When to use & impact

| Feature | Use when | Avoid when | Impact |
|---|---|---|---|
| Draft (`@odata.draft.enabled`) | Complex multi-step edits, long forms | Simple master data, high-volume integration writes | Extra tables, locks, draft cleanup |
| Composition | Child lifecycle tied to parent | Child shared across parents | Cascade delete/draft together |
| Bound action | Entity state transition | Pure read computations | Contract for workflow & UI buttons |
| Handlers | Cross-entity rules | Something annotations can express | Latency, maintenance |
| Remote delegation | Small, fresh, rarely-joined data | Large lists, sort/filter on remote fields | Latency, availability coupling |
| Replication | Joins, offline, perf | Data changes rapidly & must be real-time | Storage, sync complexity |
| Outbox | Messages/remote calls inside tx | Need synchronous response | At-least-once, extra table |
| Fiori Elements | Standard floorplans | Highly custom UX | Low maintenance, upgrade-safe |
| Freestyle UI5 | Unique UX | Standard CRUD | High maintenance |
| IAS/XSUAA | Production | Local dev (use mocked) | Setup complexity |
| Native HANA artifacts | Calc views, special DB features | Anything CDS handles | Less portable, dev≠prod divergence |
| Multitenancy | SaaS, many customers | One customer/org | Ops, upgrade orchestration, cost |
| Extensibility | Customer-specific fields | Closed system | Support surface |
| Attachments in DB | Small files | Large/volume files | DB size, backup time |
| Change tracking | Compliance, audit | High-write low-value data | Write overhead, storage |

## Decision rules

Each rule is explained in the module named in the master guide; the stage README that applies it
says so under *Key concepts*.

| ID | Decision |
|---|---|
| DEC-01 | One service per use case |
| DEC-02 | Annotations before handlers before UI logic |
| DEC-03 | Bound action vs function vs PATCH |
| DEC-04 | In-process events vs broker; outbox |
| DEC-05 | Delegate vs replicate remote data |
| DEC-06 | Fiori Elements vs freestyle |
| DEC-07 | mocked vs IAS vs XSUAA |
| DEC-08 | CDS-generated vs native HANA artifacts |
| DEC-09 | Single-tenant vs multitenant |
