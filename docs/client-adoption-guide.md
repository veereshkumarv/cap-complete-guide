<!--
What: Step-by-step implementation guide for bringing the CAP complete guide into a client
    environment as an everyday developer tool: governance, hosting, workstation setup, the project
    template (npm run new-project), daily workflows, AI-assistant use, CI/CD and BTP integration,
    maintenance, rollout plan and success measures.
Why: A reference repository only saves time if developers use it every day; that needs a defined
    path from "repository on a laptop" to "template, knowledge base and quality gate of the client's
    CAP projects".
If missing or unlinked: Adoption stays ad hoc - teams copy fragments, versions drift, guardrails
    are lost and the savings shown in the demo never materialise.
-->

# Client adoption guide - the CAP complete guide as an everyday developer tool

Goal: within 4-6 weeks every new CAP (Node.js) project of the client **starts from the template**,
developers **look up patterns** in the stages and the master guide, and every project runs the
**same quality and security gates**.

The repository plays three roles:

| Role | Part of the repository | Used by |
|------|------------------------|---------|
| **Template** - start new projects | `final-app/` via `npm run new-project` | tech leads, developers |
| **Reference / knowledge base** - how to do X, when to use it, impact | `CAP_DEVELOPMENT_GUIDE.md`, `stage-*`, `samples/`, `docs/` | developers, architects, AI assistants |
| **Quality gate** - tests, guardrails, Definition of Done, CI | `test/guardrails.test.js`, `npm run dod`, `npm run lint`, workflows | every project, CI |

---

## Phase 0 - Governance (week 0)

| # | Step | Owner | Done when |
|---|------|-------|-----------|
| 0.1 | Agree usage / IP terms for the repository and your firm's policy on AI-assisted material | engagement lead, client legal | written agreement |
| 0.2 | Name a **repository owner** (platform or architecture team) | client IT | named |
| 0.3 | Confirm target stack: SAP BTP Cloud Foundry, CAP Node.js 10.x, Node 22/24, HANA Cloud, XSUAA or IAS | architect | decision recorded |
| 0.4 | Security review of the foundation by the client's security team, based on [security-guardrails.md](security-guardrails.md) | client security | sign-off or delta list |
| 0.5 | Decide which features are standard in the client template (e.g. drop multitenancy for single-customer apps, [CAP-DEC-09]) | architect | list |

## Phase 1 - Host the repository in the client environment (week 1)

1. **Import** into the client's Git platform (GitHub Enterprise, GitLab, Azure DevOps, Bitbucket)
   as an internal repository, e.g. `sap-cap-reference`:
   ```sh
   git clone <source> sap-cap-reference && cd sap-cap-reference
   git remote set-url origin <client-git-url> && git push -u origin main
   ```
2. **Protect `main`**: pull requests with review, required CI check.
3. **CI**: the root pipeline (`.github/workflows/ci.yml`: `npm ci`, `npm run lint`, `npm test` on
   Node 22/24) runs as is on GitHub. On other platforms translate the three commands:

   | Platform | Equivalent |
   |----------|-----------|
   | Azure DevOps | `NodeTool@0` task, then `npm ci`, `npm run lint`, `npm test` |
   | GitLab CI | image `node:22`, same three commands in `script:` |
   | Jenkins / SAP CI/CD service | `cds add pipeline` generates a Piper config; add the three commands |
4. **Package registry**: if npm access is proxied (Artifactory, Nexus), point `.npmrc` to the
   proxy and verify `npm ci` works for `@sap/*`, `@cap-js/*`, `@sap-cloud-sdk/*`, `@ui5/cli`.
5. **Run the Definition of Done once** in the client CI: `npm run dod` → all ✅ (proves the
   environment).

## Phase 2 - Developer workstation (week 1)

| Tool | Version | Note |
|------|---------|------|
| Node.js | 22 or 24 LTS | `nvm use` reads `.nvmrc` |
| Git | any | |
| VS Code + *SAP CDS Language Support*, *ESLint*, *REST Client* | current | or SAP Business Application Studio (CAP dev space) |
| `@sap/cds-dk` | 10.x | comes with `npm install`; optional global `npm i -g @sap/cds-dk` |
| Browser | current Chrome/Edge | Fiori preview |
| `cf` CLI + `cf install-plugin multiapps`, `make` | v8+ | only for people who deploy |

Smoke test for every developer (15 minutes):

```sh
git clone <client-git-url>/sap-cap-reference && cd sap-cap-reference
npm install && npm test                  # all green
cd stage-05-fiori-elements && npm run watch   # open /procurement/webapp/index.html
```

Restricted networks: the Fiori preview loads SAPUI5 from `ui5.sap.com`. If blocked, serve UI5 from
an internal mirror (change the bootstrap URL in `app/*/webapp/index.html`) or use
`npx ui5 serve` with a local UI5 installation.

## Phase 3 - Create the client template (week 1-2)

Start a client template once, then every project from it.

```sh
# from the reference repository
npm run new-project -- ../client-cap-template client-cap-template
cd ../client-cap-template
git init && npm install && npm test      # 108 tests green
```

`new-project` copies `final-app` (or `--from stage-08-advanced-features` for a single-tenant
start) without `node_modules`, build output, local databases or credentials, and renames the npm
package, MTA ID and modules, XSUAA app name, Event Mesh client, pipeline app name and the
extension target.

Then adapt the template to the client's standards (one-time, in a PR):

| Area | Adapt | Files |
|------|-------|-------|
| Roles | role names and rules of the client's authorization concept | `srv/authorizations.cds`, `xs-security.json`, mocked users in `package.json` (`[development]`) |
| Features | remove what the client does not use (e.g. `mtx/`, `ext-sample/`, attachments plugin) | `package.json`, `mta.yaml`, `db/extensions.cds` |
| Identity | XSUAA → IAS/AMS if decided (`cds add ias,ams`) | `package.json`, `mta.yaml` |
| S/4HANA | destination names, principal propagation, technical destination, Cloud Connector | `package.json` `cds.requires`, `mta.yaml`, runbook ([guardrails § 3.1](security-guardrails.md#31-s4hana-access)) |
| CI/CD | client pipeline instead of / next to `.github/workflows` | pipeline files |
| Branding | app titles, i18n | `app/_i18n/`, `app/*/webapp/i18n/` |
| Docs | client links, support contacts in `README.md` and `docs/runbook.md` | docs |

Keep the guardrail tests; adapt their expectations only when a guardrail is consciously changed
(document it in the PR).

## Phase 4 - Start a real project from the template (week 2, pilot)

Two ways, depending on where the client keeps its template:

```sh
# a) client template repository: mark it as "template repository" on the Git platform and use
#    "use this template" / fork, then rename the project-level names once (package.json name,
#    mta.yaml ID) - or
# b) straight from the reference repository (the script lives there, not in projects):
npm run new-project -- ../purchasing-app purchasing-app
cd ../purchasing-app && git init && npm install && npm test
```

Replace the ACME domain step by step - tests guide you:

1. **Model** - replace `db/schema.cds` (keep the patterns: `cuid`, `managed`, code lists,
   compositions vs associations - see stage 02 README).
2. **Data** - new CSV files in `db/data/` (`<namespace>-<Entity>.csv`).
3. **Services** - adapt `srv/*-service.cds`; one service per use case ([CAP-DEC-01]).
4. **Logic** - reuse `srv/lib/` patterns (status machine, number range, totals) for the new
   objects; keep the drafts-only guard, conditional status update and open-draft check.
5. **Authorization** - new entities need `@restrict` rules **before** they are exposed; add them to
   the role matrix test.
6. **UI** - replace annotations in `app/*/annotations.cds` (stage 05 cheat sheet).
7. **Tests** - rewrite the ACME tests for the new domain; keep `test/guardrails.test.js` and
   `test/deployment.test.js` green (adapt names only).
8. **Deploy** - `npm run build:mtar`, then the runbook (`docs/runbook.md`) in the client's BTP
   space.

## Phase 5 - Everyday workflows

### 5.1 "How do I ...?" - look it up

| Need | Where |
|------|-------|
| a concept and its trade-offs | `CAP_DEVELOPMENT_GUIDE.md` (module `[CAP-Mxx]`, decision `[CAP-DEC-xx]`), `docs/decision-matrix.md` |
| working code for a feature | the stage that introduced it - root `README.md` § 5 and the final-app feature map |
| a minimal example | `samples/*` |
| what changed for a feature | `stage-*/CHANGELOG-STAGE.md`, `git diff --no-index stage-0N stage-0N+1` |
| a request to try | `stage-*/test/requests.http` |
| a security rule | `docs/security-guardrails.md` |

### 5.2 Add a feature to a project

1. Find the stage that teaches it; read *When to use / When not*, *Impact*.
2. Prefer the CAP facet: `npx cds add <facet>` (`npx cds add --help` lists them).
3. Copy the pattern (annotations, handler, config) from the stage, adapt.
4. Add tests modelled on the stage tests; run `npm test`.
5. Walk through the guardrails checklist for the new feature (authorization of every new entity
   and action, input limits, privacy annotations, remote-call limits).

### 5.3 Quality gates on every pull request

```sh
npm run lint     # ESLint + CDS lint (+ file headers in the reference repository)
npm test         # incl. guardrail regression tests
```

Optional for projects created from the template: copy `scripts/dod-report.js` and
`scripts/check-file-headers.js` from the reference repository to keep the same Definition of Done.

PR checklist (put it in the PR template):

- [ ] new entities/actions have `@restrict` / `@requires` and a test in the role matrix
- [ ] no secrets, URLs or real data committed
- [ ] remote calls: timeout, error mapping, query limits
- [ ] personal data annotated (`@PersonalData`)
- [ ] `npm run lint` and `npm test` green

### 5.4 Use with AI coding assistants

- Give the assistant the master guide as context; its sections have stable IDs (`[CAP-Mxx]`,
  `[CAP-DEC-xx]`) and are self-contained for retrieval.
- Add a project instruction file (e.g. `CLAUDE.md`, `.github/copilot-instructions.md`) with the
  rules: CDS-native before code, one service per use case, `@restrict` for every exposed entity,
  messages as i18n keys, tests for every rule, keep `test/guardrails.test.js` green.
- Every file starts with *What / Why / If missing* - assistants (and people) understand files in
  isolation.
- Review AI-generated changes like any other PR; the guardrail tests catch common regressions.

## Phase 6 - BTP and S/4HANA integration (per project)

Follow `docs/runbook.md` (in the project) and [security-guardrails.md § 3](security-guardrails.md#3-guardrails-required-before-production):

1. Entitlements and service plans in the provider subaccount (runbook § 1).
2. Destinations `S4_BP` (principal propagation) and `S4_BP_TECH` (technical, read-only) per
   consumer subaccount; Cloud Connector for on-premise.
3. Event Mesh namespace and topic rules for S/4 events; dead-message queue.
4. Role collections, custom domain, redirect URIs.
5. First deployment to a dev space: `npm run build:mtar && npm run deploy`; smoke tests (runbook § 4).
6. Pipeline: tests → deploy to dev/staging; production only with environment approval.

## Phase 7 - Maintain it

| Activity | Cadence | How |
|----------|---------|-----|
| CAP / UI5 upgrade | quarterly (or with each CAP major) | bump versions in the reference repository, `npm install && npm test && npm run dod`; record changes in stage READMEs (*Deviations from guide*); the docs win ([CAP-VERIFY]) |
| Security guardrails | with every new finding | add the finding + test to `docs/security-guardrails.md` and `test/guardrails.test.js`, back-port to the template |
| New patterns from projects | continuously | PR to the reference repository: new sample or stage, following README § 8 (*How to extend the guide*) |
| Template sync | after each reference release | projects pick up changes deliberately (diff the template release against the project) |
| Ownership review | twice a year | owner, contributors, usage metrics |

Version the reference repository with tags (`v1.0.0`, ...) so projects can state which template
version they started from.

## Phase 8 - Rollout plan

| Week | Activities | Outcome |
|------|-----------|---------|
| 0 | governance (phase 0), demo for stakeholders ([client-demo-guide.md](client-demo-guide.md)) | go decision, owner |
| 1 | hosting, CI, registry, workstation setup (phases 1-2) | every pilot developer has green tests locally |
| 1-2 | client template (phase 3), security walkthrough | template v1.0 |
| 2-4 | pilot project from the template (phase 4), first deployment to a dev space (phase 6) | pilot app running on BTP |
| 2-6 | enablement: one stage per session (10 sessions × 60-90 min) | team trained |
| 6 | retrospective, metrics, decide standard use | template mandatory for new CAP projects |

## Phase 9 - Measure the value

Agree the baseline before the pilot (see the effort worksheet in the demo guide) and measure:

| Metric | How to measure |
|--------|----------------|
| Time to first running app | from repository creation to green tests and Fiori preview (template: ~1 minute with a warm npm cache) |
| Time to first deployment | from project start to app running in the dev space |
| Foundation effort | person-days spent on items the template provides (worksheet) |
| Defects found late | security / integration defects found in test or production vs. by the guardrail tests |
| Onboarding time | days until a new developer delivers a first PR |
| Reuse | number of projects started from the template; patterns contributed back |

## Checklist

- [ ] Phase 0: terms agreed, owner named, stack confirmed, security sign-off
- [ ] Phase 1: repository in client Git, protected `main`, CI green, `npm run dod` all ✅
- [ ] Phase 2: every developer ran the smoke test
- [ ] Phase 3: client template created and adapted, tests green
- [ ] Phase 4: pilot project created from the template
- [ ] Phase 5: PR template with the checklist, AI-assistant instructions in place
- [ ] Phase 6: pilot deployed to a dev space, guardrails § 3 items assigned
- [ ] Phase 7: upgrade cadence and contribution flow agreed
- [ ] Phase 9: baseline and metrics collected
