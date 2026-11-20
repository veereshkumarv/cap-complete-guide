/**
 * What: UI5 component of the projects app - a Fiori Elements AppComponent configured by manifest.json
 *     (incl. the custom section and the controller extension).
 * Why: [CAP-M10] extensions are registered declaratively in the manifest; the component stays empty.
 * If missing or unlinked: index.html cannot start the app.
 */
sap.ui.define(['sap/fe/core/AppComponent'], function (AppComponent) {
  'use strict';
  return AppComponent.extend('sample.projects.Component', {
    metadata: { manifest: 'json' },
  });
});
