/**
 * What: Tests of the persistence setup: free-text search (@cds.search), server-driven paging
 *     (@cds.query.limit), SAP HANA as the production database, and `cds build --production`
 *     producing a complete HDI deployment module (tables, views, CSV data, native index).
 * Why: [CAP-STAGE-07] acceptance - "cds build --production succeeds; gen/db contains HDI artifacts".
 *     The HANA deployment itself needs BTP, but a broken build or a missing native artefact is
 *     caught here, on every laptop and in CI.
 * If missing or unlinked: A model change that breaks the HANA build, an unbounded query or a
 *     search over the wrong columns is only noticed during deployment.
 */
const { describe, it, before } = require('node:test');
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch
const { GET, expect } = test;
test.defaults.auth = { username: 'erin', password: '' }; // Auditor: reads every order

const P = '/odata/v4/procurement';
const root = path.join(__dirname, '..');
const orderNos = (res) => res.data.value.map((po) => po.orderNo);

describe('Search (@cds.search, stage 07)', () => {
  it('finds orders by order number and by supplier name (association)', async () => {
    expect(orderNos(await GET(`${P}/PurchaseOrders?$search=1000002&$select=orderNo`))).to.deep.equal(['PO-1000002']);
    expect(orderNos(await GET(`${P}/PurchaseOrders?$search=Lyon&$select=orderNo`))).to.deep.equal(['PO-1000004']);
  });

  it('does not search technical columns such as createdBy', async () => {
    expect(orderNos(await GET(`${P}/PurchaseOrders?$search=alice&$select=orderNo`))).to.deep.equal([]);
  });

  it('searches localized product texts in the user\'s language', async () => {
    const de = await GET(`${P}/Products?$search=Stuhl&$select=name`, { headers: { 'Accept-Language': 'de' } });
    expect(de.data.value.map((p) => p.name)).to.deep.equal(['Bürostuhl']);
  });
});

describe('Paging (@cds.query.limit, stage 07)', () => {
  before(async () => {
    // 260 extra orders, written directly to the database (no handlers, no authorization)
    const { PurchaseOrders } = cds.entities('acme.procurement');
    const rows = Array.from({ length: 260 }, (_, i) => ({
      ID: cds.utils.uuid(), orderNo: `PO-9${String(i).padStart(6, '0')}`, supplier_ID: 'a1000000-0000-4000-8000-000000000001',
      status: 'Draft', totalAmount: 0, currency_code: 'EUR', createdBy: 'fred',
    }));
    await INSERT.into(PurchaseOrders).entries(rows);
  });

  it('returns the default page (50) and a nextLink when the client sends no $top', async () => {
    const { data } = await GET(`${P}/PurchaseOrders?$select=orderNo`);
    expect(data.value).to.have.length(50);
    expect(data['@odata.nextLink']).to.be.a('string');
  });

  it('caps $top at the maximum page size (200)', async () => {
    const { data } = await GET(`${P}/PurchaseOrders?$select=orderNo&$top=1000`);
    expect(data.value).to.have.length(200);
  });

  it('still counts all rows with $count', async () => {
    const { data } = await GET(`${P}/PurchaseOrders?$count=true&$top=1`);
    expect(data['@odata.count']).to.equal(264);
  });
});

describe('Production database (stage 07)', () => {
  it('uses SQLite in development and SAP HANA in production', () => {
    expect(cds.env.requires.db.kind).to.equal('sqlite');
    const kind = execFileSync('npx', ['cds', 'env', 'requires.db.kind', '--profile', 'production'], { cwd: root, encoding: 'utf8' });
    expect(kind.trim()).to.equal('hana');
  });

  it('builds an HDI deployment module with cds build --production', () => {
    rmSync(path.join(root, 'gen'), { recursive: true, force: true });
    execFileSync('npx', ['cds', 'build', '--production'], { cwd: root, encoding: 'utf8' });
    const db = path.join(root, 'gen', 'db');

    const generated = readdirSync(path.join(db, 'src', 'gen'));
    for (const file of ['acme.procurement.PurchaseOrders.hdbtable', 'ProcurementService.PurchaseOrders.hdbview', 'ProcurementService.PurchaseOrders_drafts.hdbtable', '.hdiconfig']) {
      expect(generated, file).to.include(file);
    }
    expect(readdirSync(path.join(db, 'src', 'gen', 'data'))).to.include('acme.procurement-Products.csv');
    // native artefact + its .hdiconfig are copied next to the generated ones
    expect(existsSync(path.join(db, 'src', 'PurchaseOrders_owner_status.hdbindex'))).to.equal(true);
    expect(JSON.parse(readFileSync(path.join(db, 'src', '.hdiconfig'), 'utf8')).file_suffixes.hdbindex.plugin_name).to.equal('com.sap.hana.di.index');
    // the deployer app
    expect(JSON.parse(readFileSync(path.join(db, 'package.json'), 'utf8')).dependencies).to.have.property('@sap/hdi-deploy');
    // the service module runs against HANA in production
    expect(JSON.parse(readFileSync(path.join(root, 'gen', 'srv', 'package.json'), 'utf8')).dependencies).to.have.property('@cap-js/hana');
  });
});
