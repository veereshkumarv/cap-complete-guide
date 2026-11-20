/**
 * What: Tests for the stage 02 domain model: generated SQL, CSV volumes, calculated element,
 *     localized texts (en/de), composition cascade vs. association and code-list values.
 * Why: [CAP-STAGE-02] acceptance - `cds compile db --to sql` works and `cds watch` deploys; the tests
 *     also prove the modelling decisions the README explains (composition deletes children,
 *     association keeps the audit trail).
 * If missing or unlinked: Model regressions (a dropped composition, a broken CSV, a lost
 *     translation) reach the service stages unnoticed.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { GET, expect } = cds.test(`${__dirname}/..`);

describe('Domain model (stage 02)', () => {
  it('compiles to SQL with tables, texts tables and localized views', async () => {
    const ddl = cds.compile.to.sql(await cds.load(`${__dirname}/../db`)).join('\n');
    for (const name of ['Suppliers', 'SupplierContacts', 'Categories', 'Products', 'PurchaseOrders', 'PurchaseOrderItems', 'ApprovalLog']) {
      expect(ddl).to.contain(`CREATE TABLE acme_procurement_${name} (`);
    }
    expect(ddl).to.contain('CREATE TABLE acme_procurement_Products_texts (');
    expect(ddl).to.contain('CREATE VIEW localized_acme_procurement_Products AS');
  });

  it('loads the CSV data (>= 5 suppliers, >= 10 products, categories, orders)', async () => {
    const { Suppliers, Products, Categories, PurchaseOrders } = cds.entities('acme.procurement');
    const count = async (e) => (await SELECT.one.from(e).columns('count(*) as n')).n;
    expect(await count(Suppliers)).to.be.at.least(5);
    expect(await count(Products)).to.be.at.least(10);
    expect(await count(Categories)).to.equal(4);
    expect(await count(PurchaseOrders)).to.equal(4);
  });

  it('computes itemAmount = quantity * netPrice on read (calculated element)', async () => {
    const { PurchaseOrderItems } = cds.entities('acme.procurement');
    const item = await SELECT.one.from(PurchaseOrderItems).where({ ID: 'e1000000-0000-4000-8000-000000000001' });
    expect(Number(item.itemAmount)).to.equal(4 * 189.9);
  });

  it('serves localized product and category texts (en default, de on request)', async () => {
    const en = await GET('/odata/v4/catalog/Products(b1000000-0000-4000-8000-000000000001)');
    expect(en.data.name).to.equal('Office Chair');
    const de = await GET('/odata/v4/catalog/Products(b1000000-0000-4000-8000-000000000001)?sap-locale=de');
    expect(de.data.name).to.equal('Bürostuhl');
    const cat = await GET("/odata/v4/catalog/Categories('IT')", { headers: { 'Accept-Language': 'de' } });
    expect(cat.data.name).to.equal('IT-Ausstattung');
  });

  it('follows associations: product -> category, supplier -> orders', async () => {
    const { Products, Suppliers } = cds.entities('acme.procurement');
    const p = await SELECT.one.from(Products, (p) => { p.name, p.category((c) => c.name) }).where({ ID: 'b1000000-0000-4000-8000-000000000004' });
    expect(p.category.name).to.equal('IT Equipment');
    const s = await SELECT.one.from(Suppliers, (s) => { s.name, s.orders((o) => o.orderNo) }).where({ name: 'Bürotec GmbH' });
    expect(s.orders.map((o) => o.orderNo)).to.deep.equal(['PO-1000001']);
  });

  it('deleting an order cascades to its items (composition) but keeps the approval log (association)', async () => {
    const { PurchaseOrders, PurchaseOrderItems, ApprovalLog } = cds.entities('acme.procurement');
    const ID = 'd1000000-0000-4000-8000-000000000004';
    expect((await SELECT.from(PurchaseOrderItems).where({ parent_ID: ID })).length).to.equal(1);
    await DELETE.from(PurchaseOrders).where({ ID });
    expect(await SELECT.from(PurchaseOrderItems).where({ parent_ID: ID })).to.have.length(0);
    expect(await SELECT.from(ApprovalLog).where({ po_ID: ID })).to.have.length(1);
  });

  it('defaults the status of a new order to Draft (enum default)', async () => {
    const { PurchaseOrders } = cds.entities('acme.procurement');
    await INSERT.into(PurchaseOrders).entries({ ID: 'd1000000-0000-4000-8000-0000000000aa', supplier_ID: 'a1000000-0000-4000-8000-000000000001' });
    const po = await SELECT.one.from(PurchaseOrders, 'd1000000-0000-4000-8000-0000000000aa');
    expect(po.status).to.equal('Draft');
  });
});
