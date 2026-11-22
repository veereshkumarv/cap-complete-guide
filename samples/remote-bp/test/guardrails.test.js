/**
 * What: Guardrail tests of the remote-bp sample: login and admin role required, and a block set in
 *     S/4HANA later on the same day still replicates (LastChangeDate has day precision).
 * Why: [CAP-M08] security and S/4 review - replication actions were public, and same-day changes
 *     were skipped as "stale". Own file: own server and an untouched mock.
 * If missing or unlinked: These regressions are not caught.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks');
const { GET, POST, expect } = test;
test.defaults.auth = { username: 'alice', password: '' }; // CAP's default mocked user with role admin

const P = '/odata/v4/partners';
const local = (bpNumber) => SELECT.one.from('sample.remotebp.Partners').where({ bpNumber });

describe('Guardrails (security / S/4 review)', () => {
  it('requires a login, and the admin role for replication', async () => {
    const anon = await GET(`${P}/Partners`, { auth: undefined, headers: { authorization: '' } }).catch((e) => e);
    expect(anon.status).to.equal(401);
    const bob = await POST(`${P}/replicateAll`, {}, { auth: { username: 'bob', password: '' } }).catch((e) => e);
    expect(bob.status).to.equal(403);
  });

  it('replicates a block set later on the same day', async () => {
    const bp = await cds.connect.to('API_BUSINESS_PARTNER');
    const { A_BusinessPartner } = bp.entities;
    const { LastChangeDate } = await bp.run(SELECT.one.from(A_BusinessPartner).where({ BusinessPartner: '17100001' }));
    await POST(`${P}/replicate`, { bpNumber: '17100001' });
    await bp.run(UPDATE(A_BusinessPartner).set({ BusinessPartnerIsBlocked: true, LastChangeDate }).where({ BusinessPartner: '17100001' }));
    expect((await POST(`${P}/replicate`, { bpNumber: '17100001' })).data.value).to.equal('updated');
    expect((await local('17100001')).blocked).to.equal(true);
  });
});
