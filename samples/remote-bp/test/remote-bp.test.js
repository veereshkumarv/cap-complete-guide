/**
 * What: Tests of the remote-bp sample: live delegation ($filter/$select passed through to the
 *     mocked Business Partner API), 502 on remote failure, full replication counts, idempotency,
 *     event-driven replication and stale-event handling.
 * Why: [CAP-M08] / [CAP-DEC-05] proves both integration styles against the local mock before a
 *     real S/4HANA system is connected.
 * If missing or unlinked: A broken projection or a non-idempotent replication is found only
 *     against the real system.
 */
const { describe, it, before } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, expect } = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch

const P = '/odata/v4/partners';
const BP_CHANGED = 'sap.s4.beh.businesspartner.v1.BusinessPartner.Changed.v1';
const local = (bpNumber) => SELECT.one.from('sample.remotebp.Partners').where({ bpNumber });

describe('Delegation (live reads)', () => {
  it('reads partners from the remote API with renamed fields', async () => {
    const { data } = await GET(`${P}/RemotePartners?$orderby=ID`);
    expect(data.value).to.have.length(6);
    expect(data.value[0]).to.include({ ID: '17100001', name: 'Bürotec GmbH', blocked: false });
  });

  it('passes $filter and $select through to the remote service', async () => {
    const { data } = await GET(`${P}/RemotePartners?$filter=blocked eq true&$select=name`);
    expect(data.value.map((p) => p.name)).to.deep.equal(['Kanto Electronics KK']);
  });
});

describe('Replication (local copy)', () => {
  let bp;
  before(async () => { bp = await cds.connect.to('API_BUSINESS_PARTNER'); });

  it('full load: creates new partners, updates outdated ones, leaves current ones', async () => {
    const { data } = await POST(`${P}/replicateAll`, {});
    expect(data).to.include({ created: 4, updated: 1, unchanged: 1 });
    expect(await local('17100005')).to.include({ blocked: true, lastChanged: '2026-07-19' });
    expect(await local('17100006')).to.include({ name: 'Nordic Paper AB', country: 'SE' });
  });

  it('is idempotent: a second full load changes nothing', async () => {
    const { data } = await POST(`${P}/replicateAll`, {});
    expect(data).to.include({ created: 0, updated: 0, unchanged: 6 });
  });

  it('answers unknown for partners that do not exist in S/4HANA', async () => {
    const { data } = await POST(`${P}/replicate`, { bpNumber: '99999999' });
    expect(data.value ?? data).to.equal('unknown');
  });

  it('replicates a change event once and ignores duplicate and stale events', async () => {
    const { A_BusinessPartner } = bp.entities;
    await bp.run(UPDATE(A_BusinessPartner).set({ BusinessPartnerFullName: 'Pacific Office Supply LLC', LastChangeDate: '2026-11-20' }).where({ BusinessPartner: '17100002' }));
    const messaging = await cds.connect.to('messaging');

    await messaging.emit(BP_CHANGED, { BusinessPartner: '17100002' });
    const first = await local('17100002');
    expect(first).to.include({ name: 'Pacific Office Supply LLC', lastChanged: '2026-11-20' });

    await messaging.emit(BP_CHANGED, { BusinessPartner: '17100002' }); // duplicate delivery
    expect((await local('17100002')).replicatedAt).to.equal(first.replicatedAt);

    // stale: the remote data is older than the local copy (event overtaken by a newer one)
    await bp.run(UPDATE(A_BusinessPartner).set({ BusinessPartnerFullName: 'Old Name', LastChangeDate: '2026-01-01' }).where({ BusinessPartner: '17100002' }));
    await messaging.emit(BP_CHANGED, { BusinessPartner: '17100002' });
    expect((await local('17100002')).name).to.equal('Pacific Office Supply LLC');
  });

  it('keeps serving the replicated copy when S/4HANA is down - delegation answers 502 (keep last)', async () => {
    bp.prepend(() => bp.on('READ', () => { throw new Error('ECONNREFUSED 10.0.0.1:443'); }));
    const err = await GET(`${P}/RemotePartners`).catch((e) => e);
    expect(err.status).to.equal(502);
    expect(err.message).to.not.contain('ECONNREFUSED');
    const { data } = await GET(`${P}/Partners?$filter=blocked eq true`);
    expect(data.value.map((p) => p.bpNumber)).to.deep.equal(['17100005']);
  });
});
