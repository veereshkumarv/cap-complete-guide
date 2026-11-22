<!--
What: Step-by-step script for a 45-60 minute client demo of the CAP complete guide: preparation,
    the demo storyline in six acts with commands, what to show and what to say, the value message
    (shorter delivery through pre-built, tested boilerplate), a worksheet to quantify the savings
    with the client's own numbers, and the honest limits.
Why: Presenters need a rehearsed, repeatable flow that shows business value (time, quality,
    security) rather than a code tour - and must not over-claim what is verified.
If missing or unlinked: Every demo is improvised, value statements become unfounded claims, and
    the strongest proof points (tests, guardrails, one-command project start) are forgotten.
-->

# Client demo guide - "From zero to a secure SAP CAP + Fiori app in minutes, not weeks"

**Audience:** client IT leads, SAP architects, delivery managers, developers.
**Duration:** 45-60 minutes (short version: acts 1, 2, 4 and 6 in 25 minutes).
**Message:** every SAP CAP project re-builds the same foundation - data model patterns, Fiori
annotations, authorization, HANA build, plugins, multitenancy, MTA, pipelines, security checks.
This repository delivers that foundation **pre-built, documented and tested**, so a project team
starts with its business logic on day one.

---

## 1. Preparation (day before, 30 minutes)

| Step | Command / action | Check |
|------|------------------|-------|
| 1 | `git pull` in `cap-complete-guide`, then `nvm use` (Node 22 or 24) | `node -v` |
| 2 | `npm install` | no errors |
| 3 | `npm test` | all workspaces green (~2.5 min) - keep the terminal output for act 5 |
| 4 | `npm run dod -- --only final-app` | one row, all ✅ |
| 5 | rehearse act 2 once in the browser (see below) | the flow takes < 3 min |
| 6 | open in tabs: `README.md` (status table), `docs/security-guardrails.md`, `docs/images/` | for screen sharing and as offline fallback |
| 7 | **internet check** - the UI loads SAPUI5 from `ui5.sap.com` | if blocked: use the screenshots in `docs/images/` |
| 8 | 3 private browser windows ready (users `alice`, `bob`, `erin`, empty password) | switch roles quickly |
| 9 | clear the client's confidentiality rules / your firm's policy for showing or sharing code | before the meeting |

Terminal tabs to open before the meeting:

```sh
# tab 1 - the app (stage 08 shows most features; NO_TELEMETRY keeps the log readable)
cd stage-08-advanced-features && NO_TELEMETRY=true npm run watch     # http://localhost:4004

# tab 2 - free for commands (repo root)
# tab 3 - optional, multitenancy (act 4): sidecar + app with tenants
cd stage-09-extensibility-mtx && npm run watch:sidecar
```

---

## 2. Demo storyline

### Act 1 - The problem and the asset (5 min)

**Show:** root `README.md` → *Build status* table and the learning-path diagram.

**Say:**
- "Every CAP project needs the same 20+ building blocks before the first business feature: domain
  model conventions, draft handling, Fiori annotations, roles, HANA build, attachments, audit log,
  outbox, multitenancy, MTA, CI/CD, security reviews."
- "Here they are as ten cumulative stages, seven focused samples and one final reference app - each
  runnable, each with tests, each documented with *when to use / when not* and *impact*."
- "Everything is verified locally with CAP 10.2: 108 tests in the final app, all stages green in
  CI on Node 22 and 24."

**Proof:** status table (tests per stage), `docs/dod-report.md` (all ✅).

### Act 2 - A working business app (10 min)

**Show:** <http://localhost:4004/procurement/webapp/index.html>

| Step | User | Action | Point to make |
|------|------|--------|---------------|
| 1 | `alice` (Requester) | sees only **her** 3 orders | row-level security is declarative (`@restrict where createdBy = $user`) |
| 2 | `alice` | **Create** → supplier value help → add item → price fills in → total updates | value helps, defaulting, live totals: annotations + 1 handler, no UI code |
| 3 | `alice` | **Save** → **Submit** | status workflow as bound actions; buttons enabled only when allowed |
| 4 | `bob` (Approver) | open the order → **Approve** | four-eyes rule: alice cannot approve her own order |
| 5 | `erin` (Auditor) | open it → **Change History** (*Show More*), **Attachments** | audit trail and files via plugins - a few lines of annotations |
| 6 | any | switch the browser to German (`?sap-language=de`) | i18n built in |

**Say:** "This is roughly 3,000 lines of model, logic, annotations and configuration - most of it
generic patterns your team would otherwise write and debug first."

**Fallback:** screenshots `docs/images/stage-0[5-8]-*.png`.

### Act 3 - SAP S/4HANA integration done right (8 min)

**Show:** `requests.http` requests 36-37 in `stage-08-advanced-features/test/` (or curl):

```sh
# replicate business partners from (mocked) S/4HANA - Admin only
curl -u dave: -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:4004/odata/v4/admin/replicateSuppliers
# Kanto is blocked in S/4HANA -> new orders for it are rejected
curl -u alice: -H 'Content-Type: application/json' -d '{"supplier_ID":"a1000000-0000-4000-8000-000000000005"}' http://localhost:4004/odata/v4/procurement/PurchaseOrders
```

**Say:**
- "The S/4 Business Partner API is imported, mocked for development and tests, and used two ways:
  live reads and replicated copies - with the decision rule for when to use which."
- "Replication is event-driven, idempotent and protected against stale and duplicate events; the
  outbox makes messages transactional."
- "The production settings for S/4 access are prepared: per-tenant destinations, timeouts, query
  guards, error mapping - and the open decisions (principal propagation, Cloud Connector) are
  listed in the guardrails."

**Show briefly:** `docs/security-guardrails.md` § 1.3 and § 3.1.

### Act 4 - SaaS and extensibility (optional, 7 min)

**Show:** stage 09 (`npm run subscribe && npm run watch:mtx`), screenshots
`docs/images/stage-09-*.png`.

**Say:** "Two customers, one deployment, separate databases. Customer A adds a field without a
provider release; customer B is unaffected; provider rules stop unsafe extensions." Show a
rejected extension (request 43/44 in `stage-09-extensibility-mtx/test/requests.http`: 422).

### Act 5 - Quality and security built in (8 min)

**Show:**
1. `npm test -w final-app` output (108 tests, ~25 s) - "every rule has a test".
2. `final-app/test/guardrails.test.js` - "the security review is executable: if someone removes a
   guardrail, the build fails".
3. `docs/security-guardrails.md` - findings fixed (with tests) and the production checklist.

**Say:** "We had the code reviewed for security, S/4 access and correctness. Twenty-plus findings
were fixed with regression tests - for example, an approved order could be changed by deleting
items, and a tenant without its own destination would have used the provider's S/4. Your project
starts with those lessons already in the code."

### Act 6 - Boilerplate generation: a new project in one minute (7 min)

**Show live** (tab 2):

```sh
npm run new-project -- ../client-demo-app client-demo-app
cd ../client-demo-app && git init && npm install && npm test   # ~30 s install (cached) + ~25 s tests
grep -n "^ID:\|xsappname" mta.yaml                            # renamed for the new project
```

**Say:**
- "One command gives a new, renamed project with security, HANA, plugins, multitenancy, MTA,
  pipelines and 108 passing tests. The team replaces the ACME domain with theirs and keeps the
  platform."
- "`npm run build:mtar` produces the deployable archive in 2-3 minutes; the runbook covers the BTP
  steps."

**Close:** show the effort worksheet (section 3) and agree on next steps (section 5).

---

## 3. Value: what the client no longer builds

What the starter contains, measured on this repository (final app):

| Building block | In the starter | Measured |
|----------------|----------------|----------|
| Project structure, profiles (dev/test/hybrid/production) | `package.json` cds config | ready |
| Domain patterns: compositions, code lists, localization, number range, totals | `db/`, `srv/lib/` | ready |
| Draft-enabled Fiori Elements app with value helps, side effects, custom section | `app/procurement/` (169 lines of annotations) | ready |
| Workflow as state machine with four-eyes rule | `srv/lib/status.js`, `changeStatus()` | ready |
| Authorization: 5 roles, row-level rules, UI hints, XSUAA descriptor | `srv/authorizations.cds`, `xs-security.json` (101 lines) | ready |
| HANA build, native index, search, paging, performance script | `db/src/`, `srv/query-options.cds`, `npm run perf` | ready |
| Attachments, change history, audit log, privacy, telemetry | plugins + 3 annotation files | ready |
| S/4HANA API import, mock, live + replicated access, outbox, idempotent consumers | `srv/external/`, `srv/integration/` | ready |
| Multitenancy and extension rules | `mtx/sidecar/`, `ext-sample/` | ready |
| Deployment descriptor (11 BTP services), approuter, HTML5 repo | `mta.yaml` (262 lines) | `.mtar` built in ~2.5 min |
| CI/CD pipelines, lint, Definition of Done checks | `.github/workflows/`, `npm run dod` | ready |
| Tests | 108 tests, 1,680 lines | ~25 s |
| Security review findings fixed + regression tests | `docs/security-guardrails.md`, `test/guardrails.test.js` | 17 tests |
| Start a new project | `npm run new-project` | ~1 min incl. install and tests (warm npm cache) |

### Effort worksheet - fill in with the client

Do not quote fixed percentages; let the client's own estimates speak. Use the rows above as the
work breakdown:

| Work item | Client estimate without starter (person-days) | With starter (person-days) | Note |
|-----------|----------------------------------------------|----------------------------|------|
| Project setup, structure, profiles, tooling | | adapt only | |
| Fiori Elements app foundation | | replace domain annotations | |
| Authorization concept + implementation + tests | | adapt roles/rules | |
| HANA persistence and build | | configure | |
| Attachments, change log, audit log, privacy | | annotate own entities | |
| S/4HANA integration pattern | | point to own APIs | |
| Multitenancy / extensibility (if SaaS) | | configure | |
| MTA, approuter, pipelines | | rename (automated), BTP setup | |
| Security review of the foundation | | review delta only | |
| **Total** | | | |

Typical sources of savings to discuss: no foundation build, fewer integration defects (tested
patterns), shorter security review (guardrails already applied), faster onboarding (stages as
training path).

---

## 4. Questions to expect - and honest answers

| Question | Answer |
|----------|--------|
| Is it production-ready? | The foundation is tested locally and the `.mtar` builds; deployment to BTP, real S/4 connectivity and the BTP services were **not** executed. The guardrails checklist lists what each project must configure. |
| Which versions? | `@sap/cds` 10.2, SAPUI5 1.148 LTS, Node 22/24. Older CAP versions need adaptation. |
| Java? | Node.js only. The CDS models and annotations are reusable; the handlers are not. |
| Can we use IAS instead of XSUAA? | Yes - `cds add ias` (+ `ams`); decision rule in the guide, not implemented in the starter. |
| Who maintains it? | See the adoption guide: owner, CAP upgrade cadence, contribution flow. |
| Can it be used with AI coding assistants? | Yes - the master guide is structured for retrieval (stable IDs per section) and every file explains itself (What / Why / If missing). |

---

## 5. Closing and next steps to propose

1. **Pilot** (2-4 weeks): one real use case on the starter (see [client-adoption-guide.md](client-adoption-guide.md), phase 2).
2. **Enablement**: the stages as a training curriculum for the client team (one stage per session).
3. **Security alignment**: walk through [security-guardrails.md](security-guardrails.md) § 3 with the client's security and BTP platform team.
4. **Baseline the effort worksheet** with the client's own numbers to measure the pilot against.

## 6. Do not

- claim fixed savings percentages or "production-ready" status;
- show real client data in the demo (sample data only);
- hand over the repository before the IP / usage terms are agreed.
