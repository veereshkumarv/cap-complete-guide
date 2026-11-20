/**
 * What: UI5 component of the "Manage Purchase Orders" app - a Fiori Elements AppComponent whose
 *     whole configuration comes from manifest.json.
 * Why: [CAP-M09] Fiori Elements apps need no controller code; the component only points UI5 to the
 *     manifest (routing to List Report and Object Page, OData V4 model).
 * If missing or unlinked: index.html cannot instantiate the app ("failed to load
 *     acme/procurement/Component.js") and the page stays blank.
 */
sap.ui.define(['sap/fe/core/AppComponent'], function (AppComponent) {
  'use strict';
  return AppComponent.extend('acme.procurement.Component', {
    metadata: { manifest: 'json' },
  });
});
