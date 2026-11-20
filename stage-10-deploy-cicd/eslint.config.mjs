/**
 * What: ESLint flat configuration of the deployable app: CAP's recommended rules and the
 *     @sap/eslint-plugin-cds model checks (`cds lint`), browser/UI5 globals for the Fiori webapp,
 *     build output ignored. Created by `cds add lint`, aligned with the repository's root config.
 * Why: [CAP-M23] the pipeline (.github/workflows/test.yaml) runs `npx cds lint .` as a quality gate
 *     when this folder is its own repository; inside the guide repository ESLint uses this file for
 *     the files of this stage.
 * If missing or unlinked: `cds lint` reports "ESLint is not installed / no configuration" and the
 *     lint gate of the pipeline is gone.
 */
import cds from '@sap/cds/eslint.config.mjs';
import cdsPlugin from '@sap/eslint-plugin-cds';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/gen/**', '**/mta_archives/**', '**/dist/**', '**/resources/**', 'ext-sample/.base/**'] },
  ...cds.recommended,
  cdsPlugin.configs.recommended,
  {
    files: ['app/**/webapp/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, sap: 'readonly' } },
  },
];
