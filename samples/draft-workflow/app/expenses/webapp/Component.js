/**
 * What: UI5 component of the expenses app - a Fiori Elements AppComponent configured by manifest.json.
 * Why: [CAP-M09] Fiori Elements apps need no controller code; draft, buttons and side effects come
 *     from annotations.
 * If missing or unlinked: index.html cannot start the app and the page stays blank.
 */
sap.ui.define(['sap/fe/core/AppComponent'], function (AppComponent) {
  'use strict';
  return AppComponent.extend('sample.expenses.Component', {
    metadata: { manifest: 'json' },
  });
});
