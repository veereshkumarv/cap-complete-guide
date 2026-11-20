/**
 * What: Tests of the Fiori Elements extensions: the Budget formatter (unit tests in Node by stubbing
 *     sap.ui.define), the manifest wiring of the custom section and the controller extension (names
 *     resolve to served files, target IDs match the routing), and the standard annotations.
 * Why: [CAP-M10] extensions are referenced by strings - a typo in a template or controller name only
 *     shows as a broken page; these checks catch it without a browser.
 * If missing or unlinked: A renamed fragment or controller breaks the Object Page unnoticed.
 */
const { describe, it } = require('node:test');
const path = require('node:path');
const cds = require('@sap/cds');

const { GET, expect } = cds.test(`${__dirname}/..`);

const W = '/projects/webapp';
/** Loads a UI5 AMD module (sap.ui.define) in Node and returns its export. */
function loadUi5Module(file) {
  let exported;
  global.sap = { ui: { define: (deps, factory) => { exported = factory(); } } };
  require(path.join(__dirname, '../app/projects/webapp', file));
  delete global.sap;
  return exported;
}
/** "sample.projects.ext.fragment.Budget" -> "/projects/webapp/ext/fragment/Budget" */
const toUrl = (name) => `${W}/${name.replace(/^sample\.projects\./, '').replace(/\./g, '/')}`;

describe('Budget formatter (unit)', () => {
  const fmt = loadUi5Module('ext/fragment/BudgetFormatter.js');

  it('computes the percentage (capped at 100 for the bar) and the label', () => {
    expect(fmt.percent('21500.00', '50000.00')).to.equal(43);
    expect(fmt.percent('131000.00', '120000.00')).to.equal(100);
    expect(fmt.label('131000.00', '120000.00')).to.equal('109 % of budget used');
    expect(fmt.percent('100', null)).to.equal(0); // no budget - no division by zero
  });

  it('maps the ratio to a value state', () => {
    expect(fmt.state('21500', '50000')).to.equal('Success');
    expect(fmt.state('27900', '30000')).to.equal('Warning'); // 93 %
    expect(fmt.state('131000', '120000')).to.equal('Error');
  });

  it('shows what is left or how much the budget is exceeded', () => {
    expect(fmt.remaining('21500.00', '50000.00', 'EUR')).to.equal('28500.00 EUR left');
    expect(fmt.remaining('131000.00', '120000.00', 'EUR')).to.equal('11000.00 EUR over budget');
  });
});

describe('Manifest wiring of the extensions', () => {
  let manifest;
  it('serves manifest, fragment, formatter and controller extension', async () => {
    manifest = (await GET(`${W}/manifest.json`)).data;
    const section = manifest['sap.ui5'].routing.targets.ProjectsObjectPage.options.settings.content.body.sections.Budget;
    expect((await GET(`${toUrl(section.template)}.fragment.xml`)).status).to.equal(200);
    expect((await GET(`${W}/ext/fragment/BudgetFormatter.js`)).status).to.equal(200);

    const extensions = manifest['sap.ui5'].extends.extensions['sap.ui.controllerExtensions'];
    const [key, { controllerName }] = Object.entries(extensions)[0];
    expect((await GET(`${toUrl(controllerName)}.controller.js`)).status).to.equal(200);
    // "<base controller>#<app id>::<routing target id>" must point to the real Object Page target
    expect(key).to.equal(`sap.fe.templates.ObjectPage.ObjectPageController#${manifest['sap.app'].id}::ProjectsObjectPage`);
  });

  it('places the custom section after an existing facet ID', async () => {
    const section = manifest['sap.ui5'].routing.targets.ProjectsObjectPage.options.settings.content.body.sections.Budget;
    const { data } = await GET('/odata/v4/projects/$metadata');
    expect(data).to.contain(`<PropertyValue Property="ID" String="${section.position.anchor}"/>`);
  });

  it('keeps the standard UI annotation-based', async () => {
    const { data } = await GET('/odata/v4/projects/$metadata');
    for (const term of ['UI.LineItem', 'UI.HeaderInfo', 'UI.Facets', 'UI.FieldGroup']) expect(data, term).to.contain(`Term="${term}"`);
  });
});
