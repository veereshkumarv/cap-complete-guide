<!--
What: Files added or changed in stage 10 compared with stage 09.
Why: [CAP-AGENT] rule 9 - learners see exactly what deployment and CI/CD add.
If missing or unlinked: Readers must diff stage-09-extensibility-mtx and this folder by hand.
-->

# CHANGELOG - stage 10 (deployment & CI/CD)

Compare: `git diff --no-index stage-09-extensibility-mtx stage-10-deploy-cicd`

| File | Change | Why |
|------|--------|-----|
| `mta.yaml` | added | by `cds add mta,html5-repo,malware-scanner,cloud-logging`; header, texts (description, display name, category), html5 `build-result: dist` |
| `event-mesh.json` | added | SAP Event Mesh instance parameters (by `cds add mta`, messaging configured since stage 08) |
| `app/procurement/package.json`, `package-lock.json`, `ui5.yaml` | added | Fiori app as UI5 project; zip for the HTML5 repository |
| `app/procurement/xs-app.json` | added | routes inside the HTML5 app (by `cds add html5-repo`) |
| `.deploy/app-router/xs-app.json` | changed | `/-/cds` → sidecar, `/odata` → service, rest → HTML5 repo; welcome file `/acmeprocurement/index.html` |
| `mtx/sidecar/package.json`, `package-lock.json` | changed / added | `html5-host`; lock file for `npm ci` |
| `xs-security.json` | changed | `emcallback`, `emmanagement` scopes and authorities (Event Mesh) |
| `package.json` | changed | `html5-repo`, `malware-scanner`, `[production]` telemetry `to-cloud-logging`, OTLP exporters (pinned to the plugin's OpenTelemetry line), `eslint`, `@sap/eslint-plugin-cds`, `globals`, `yaml`; scripts `build:mtar`, `deploy` |
| `scripts/build-mtar.sh`, `scripts/deploy.sh` | added | build the `.mtar` from a clean copy; deploy with pre-flight checks / blue-green |
| `docs/runbook.md` | added | setup, deploy, onboarding, smoke tests, upgrade, rollback, monitoring, incidents |
| `.github/workflows/test.yaml`, `cf.yaml`, `release.yaml` | added | by `cds add github-actions`; headers, local reusable-workflow references, lint + test steps |
| `eslint.config.mjs`, `.vscode/settings.json` | added | by `cds add lint`; aligned with the root config, headers |
| `test/deployment.test.js` | added | 10 tests for descriptor, production config, build output, routes, workflows |
| `test/authz.test.js` | changed | Event Mesh scopes expected |
| `test/requests.http` | extended | request 49 (health check) |
| `ext-sample/package.json`, `srv/extension.cds` | changed | extends `procurement-stage-10` |
| `.gitignore` | changed | `dist/` (UI5 build output) |
| `../scripts/check-file-headers.js` | changed | `event-mesh.json` exempt (broker parameters) |
