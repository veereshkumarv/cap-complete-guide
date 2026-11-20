/**
 * What: Smoke test for stage 01 - starts the app in-process with cds.test and reads Products.
 * Why: [CAP-STAGE-01] acceptance: `npm test` passes and GET /odata/v4/catalog/Products returns the
 *     CSV rows. Also the minimal cds.test pattern every later stage builds on ([CAP-M04]).
 * If missing or unlinked: npm test has nothing to run and a broken model or CSV goes unnoticed.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, expect } = cds.test(`${__dirname}/..`);

describe('CatalogService (stage 01)', () => {
  it('serves the service index', async () => {
    const { status } = await GET('/odata/v4/catalog');
    expect(status).to.equal(200);
  });

  it('returns the products loaded from CSV', async () => {
    const { data } = await GET('/odata/v4/catalog/Products?$orderby=name');
    expect(data.value).to.have.length(5);
    expect(data.value[0]).to.include({ name: 'Laptop 14', currency: 'EUR', stock: 25 });
  });

  it('rejects writes because the entity is @readonly', async () => {
    // cds.test's HTTP helpers throw for 4xx/5xx; the error carries the status.
    const err = await POST('/odata/v4/catalog/Products', { name: 'Not allowed' }).catch((e) => e);
    expect(err.status).to.equal(405);
  });
});
