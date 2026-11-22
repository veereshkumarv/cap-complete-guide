<!--
What: Files added or changed in stage 05 compared with stage 04.
Why: [CAP-AGENT] rule 9 - learners see exactly what a Fiori Elements UI adds to a CAP service.
If missing or unlinked: Readers must diff stage-04-custom-logic and this folder by hand.
-->

# CHANGELOG - stage 05 (Fiori Elements)

Compare: `git diff --no-index stage-04-custom-logic stage-05-fiori-elements`

| File | Change | Why |
|------|--------|-----|
| `app/services.cds` | added | entry point CAP loads for UI annotations |
| `app/procurement/annotations.cds` | added | List Report / Object Page, value helps, side effects, criticality, action buttons and availability |
| `app/_i18n/i18n.properties`, `i18n_de.properties` | added | annotation labels (en, de) |
| `app/procurement/webapp/index.html` | added | standalone start page (UI5 1.148 LTS from the CDN) |
| `app/procurement/webapp/Component.js` | added | Fiori Elements `AppComponent` |
| `app/procurement/webapp/manifest.json` | added | OData V4 data source, routing, table settings, custom section |
| `app/procurement/webapp/i18n/i18n*.properties` | added | app title and custom section texts |
| `app/procurement/webapp/ext/fragment/ApprovalHistory.fragment.xml` | added | custom object page section ([CAP-M10]) |
| `srv/procurement-service.cds` | changed | virtual element `statusCriticality` |
| `srv/procurement-service.js` | changed | after-READ handler fills `statusCriticality` |
| `srv/lib/status.js` | changed | `criticality(status)` |
| `test/ui.test.js` | added | 5 tests: app served, annotations, i18n labels, colours, draft UI flow |
| `test/requests.http` | extended | requests 15-17 (manifest, German metadata, list request) |
| `package.json` | changed | name, description |
| `../docs/images/stage-05-fiori-elements-*.png` | added | screenshots (list, object page, German list) |
| `test/guardrails.test.js` and the files it covers | added / fixed later | 9 regression tests for the fixes of the [security and code review](../docs/security-guardrails.md) (applied to every stage where the code exists) |
