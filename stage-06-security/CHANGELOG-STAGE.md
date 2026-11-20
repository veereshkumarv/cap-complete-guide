<!--
What: Files added or changed in stage 06 compared with stage 05.
Why: [CAP-AGENT] rule 9 - learners see exactly what securing a CAP app adds.
If missing or unlinked: Readers must diff stage-05-fiori-elements and this folder by hand.
-->

# CHANGELOG - stage 06 (security)

Compare: `git diff --no-index stage-05-fiori-elements stage-06-security`

| File | Change | Why |
|------|--------|-----|
| `srv/authorizations.cds` | added | `@requires` / `@restrict` for ProcurementService and AdminService (5 roles, instance-based) |
| `srv/lib/permissions.js` | added | `canEdit(user, order)` - UI hint mirroring the UPDATE/DELETE rules |
| `srv/procurement-service.cds` | changed | virtual element `canEdit` |
| `srv/procurement-service.js` | changed | computes `canEdit`; `before READ` adds the inputs of virtual elements to `$select` |
| `app/procurement/annotations.cds` | changed | `UI.UpdateHidden` / `UI.DeleteHidden: (not canEdit)`, `canEdit @UI.Hidden` |
| `package.json` | changed | mocked users with roles, `"*": false`; `[production]` auth `xsuaa` and `@sap/xssec` (by `cds add xsuaa`); name, description |
| `xs-security.json` | added | scopes and role templates (by `cds add xsuaa`, descriptions edited) |
| `.deploy/app-router/package.json`, `xs-app.json` | added | application router (by `cds add approuter`; header, welcome file, logout added) |
| `test/authz.test.js` | added | 19 tests: authentication, visibility, role × operation, `canEdit`, XSUAA configuration |
| `test/actions.test.js`, `handlers.test.js`, `remote.test.js`, `ui.test.js` | changed | requests sent as users with the right role; four-eyes test uses `gina` |
| `test/units.test.js` | changed | `canEdit` unit tests |
| `test/requests.http` | changed | `Authorization` headers; requests 18-24 (401 / 404 / 403) |
| `../docs/images/stage-06-security-*.png` | added | screenshots as alice and bob |
| `../scripts/check-file-headers.js` | changed | `xs-app.json` exempt from headers (strict approuter schema) |
| `../scripts/copy-stage.js` | changed | rewrites the stage number in the `package.json` header |
