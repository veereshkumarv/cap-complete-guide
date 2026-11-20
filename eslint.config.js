/**
 * What: ESLint flat configuration for the whole guide repository: CAP's recommended rules and
 *     @sap/eslint-plugin-cds model checks for all CAP projects, browser/UI5 globals for webapp code,
 *     ES module rules for the repo scripts.
 * Why: [CAP-S09] Definition of Done requires lint-clean code; `cds lint` uses the same CAP plugin.
 *     One config keeps every stage, sample and the final app on the same rules.
 * If missing or unlinked: `npm run lint` fails with "no configuration found" and style or CDS
 *     modelling mistakes are no longer caught.
 */
import cds from '@sap/cds/eslint.config.mjs';
import cdsPlugin from '@sap/eslint-plugin-cds';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/gen/**', '**/mta_archives/**', '**/resources/**', '**/@cds-models/**'] },
  ...cds.recommended,
  cdsPlugin.configs.recommended,
  {
    files: ['**/app/**/webapp/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, sap: 'readonly' } },
  },
  {
    files: ['scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-console': 'off' }, // command-line scripts report to the terminal
  },
];
