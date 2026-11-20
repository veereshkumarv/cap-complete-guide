/**
 * What: Tests of RemoteSuppliers: delegation of OData queries to the (mocked) S/4HANA Business
 *     Partner API and the 502 answer when the remote system fails.
 * Why: [CAP-M08] / [CAP-STAGE-04] remote service mock; proves that the projection, query options and
 *     error handling work before a real S/4HANA system is connected.
 * If missing or unlinked: A broken remote mapping or an unhandled remote error is only found
 *     against the real system.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch
const { GET, expect } = test;
test.defaults.auth = { username: 'carol', password: '' }; // stage 06: RemoteSuppliers is for Buyers and Admins

const P = '/odata/v4/procurement';

describe('RemoteSuppliers (stage 04)', () => {
  it('delegates reads to the mocked Business Partner API with renamed fields', async () => {
    const { data } = await GET(`${P}/RemoteSuppliers?$orderby=ID`);
    expect(data.value).to.have.length(6);
    expect(data.value[0]).to.include({ ID: '17100001', name: 'Bürotec GmbH', blocked: false });
  });

  it('passes $filter and $select through to the remote service', async () => {
    const { data } = await GET(`${P}/RemoteSuppliers?$filter=blocked eq true&$select=name`);
    expect(data.value.map((s) => s.name)).to.deep.equal(['Kanto Electronics KK']);
  });

  it('answers 502 with a readable message when the remote API fails', async () => {
    const bp = await cds.connect.to('API_BUSINESS_PARTNER');
    bp.prepend(() => bp.on('READ', () => { throw new Error('ECONNREFUSED'); }));
    const err = await GET(`${P}/RemoteSuppliers`).catch((e) => e);
    expect(err.status).to.equal(502);
    expect(err.message).to.contain('not available');
  });
});
