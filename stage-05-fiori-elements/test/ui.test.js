/**
 * What: Tests of the Fiori Elements app: the static app files are served, $metadata carries the UI
 *     annotations (list, filters, facets, value helps, side effects, action availability) with
 *     translated labels, statusCriticality colours each status, and the UI flow "create draft ->
 *     add item -> activate -> submit" works through the same OData calls the app sends.
 * Why: [CAP-STAGE-05] acceptance - "list loads; create draft -> add items -> submit works". A typo in
 *     annotations.cds compiles silently but leaves the app without columns or buttons; this catches it
 *     without a browser.
 * If missing or unlinked: Broken annotations or a broken draft flow are only noticed by opening the
 *     app by hand.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, expect } = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch

const P = '/odata/v4/procurement';
const SUPPLIER = 'a1000000-0000-4000-8000-000000000001'; // Bürotec GmbH
const CHAIR = 'b1000000-0000-4000-8000-000000000001'; // Office Chair, 189.90 EUR
const alice = { auth: { username: 'alice', password: '' } };

describe('Fiori Elements app (stage 05)', () => {
  it('serves the app files from app/procurement/webapp', async () => {
    const { status, data } = await GET('/procurement/webapp/manifest.json');
    expect(status).to.equal(200);
    expect(data['sap.app'].dataSources.ProcurementService.uri).to.equal(`${P}/`);
  });

  it('publishes the UI annotations in $metadata', async () => {
    const { data } = await GET(`${P}/$metadata`);
    for (const term of ['UI.LineItem', 'UI.SelectionFields', 'UI.HeaderInfo', 'UI.Facets', 'UI.FieldGroup', 'UI.Identification', 'Common.ValueList', 'Common.SideEffects']) {
      expect(data, term).to.contain(`Term="${term}"`);
    }
    // the Submit button is only enabled for orders in status Draft
    expect(data).to.match(/Core\.OperationAvailable[\s\S]{0,200}Draft/);
  });

  it('translates annotation labels from app/_i18n', async () => {
    const en = await GET(`${P}/$metadata`);
    expect(en.data).to.contain('String="Order Number"');
    const de = await GET(`${P}/$metadata`, { headers: { 'Accept-Language': 'de' } });
    expect(de.data).to.contain('String="Bestellnummer"');
  });

  it('colours each status via statusCriticality', async () => {
    const { data } = await GET(`${P}/PurchaseOrders?$select=status,statusCriticality&$orderby=orderNo`);
    const colours = Object.fromEntries(data.value.map((po) => [po.status, po.statusCriticality]));
    expect(colours).to.deep.equal({ Draft: 0, Submitted: 2, Approved: 3, Rejected: 1 });
  });

  it('runs the UI flow: create draft, add item, activate, submit', async () => {
    const { data: draft } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER, currency_code: 'EUR' }, alice);
    const key = `ID=${draft.ID}`;
    expect(draft.orderNo).to.match(/^PO-\d+$/);

    const { data: item } = await POST(`${P}/PurchaseOrders(${key},IsActiveEntity=false)/items`, { product_ID: CHAIR, quantity: 2 }, alice);
    expect(Number(item.netPrice)).to.equal(189.9);

    await POST(`${P}/PurchaseOrders(${key},IsActiveEntity=false)/ProcurementService.draftActivate`, {}, alice);
    const { data: submitted } = await POST(`${P}/PurchaseOrders(${key},IsActiveEntity=true)/ProcurementService.submit`, {}, alice);
    expect(submitted).to.include({ status: 'Submitted' });
    expect(Number(submitted.totalAmount)).to.equal(379.8);
  });
});
