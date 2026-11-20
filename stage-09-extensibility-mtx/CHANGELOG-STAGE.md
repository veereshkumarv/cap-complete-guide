<!--
What: Files added or changed in stage 09 compared with stage 08.
Why: [CAP-AGENT] rule 9 - learners see exactly what multitenancy and extensibility add.
If missing or unlinked: Readers must diff stage-08-advanced-features and this folder by hand.
-->

# CHANGELOG - stage 09 (extensibility & multitenancy)

Compare: `git diff --no-index stage-08-advanced-features stage-09-extensibility-mtx`

| File | Change | Why |
|------|--------|-----|
| `package.json` | changed | `@sap/cds-mtxs`, `"profile": "with-mtx-sidecar"`, `[with-mtx]` multitenancy, `[production]` multitenancy, `extensibility: true` (by `cds add multitenancy,extensibility`); users with explicit tenants, `dave` + `cds.ExtensionDeveloper`; scripts `watch:sidecar`, `watch:mtx`, `subscribe` |
| `mtx/sidecar/package.json` | added | MTX sidecar (by `cds add multitenancy`); header, `@cap-js/change-tracking`, extension rules |
| `xs-security.json` | changed | `mtcallback`, `cds.ExtensionDeveloper` scope/role template, `authorities` (by `cds add`); duplicate scopes removed |
| `.deploy/app-router/xs-app.json` | changed | route `/-/cds/*` to the sidecar destination `mtx-api` (by `cds add`) |
| `ext-sample/package.json`, `.gitignore`, `srv/extension.cds`, `README.md` | added | sample tenant extension project (from `cds init --add extension`) |
| `scripts/subscribe.sh` | added | subscribe t1 and t2 locally |
| `srv/admin-service.js` | changed | replication errors → 502 `REMOTE_UNAVAILABLE` (also back-ported to stage 08) |
| `test/mtx.test.js` | added | 7 end-to-end tests with sidecar + app processes |
| `test/authz.test.js` | changed | expects the MTX scopes and role template |
| `test/advanced.test.js` | changed | replication failure → 502 (also in stage 08) |
| `test/requests.http` | extended | requests 40-48 (subscribe, extensions, rules, isolation, unsubscribe) |
| `.gitignore`, `../.gitignore` | changed | `*.sqlite-*` (WAL/SHM files of tenant databases) |
| `../docs/images/stage-09-extensibility-mtx-*.png` | added | object page in tenant t1 (extended) and t2 |
