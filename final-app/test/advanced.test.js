/**
 * What: Tests of the stage 08 features: change tracking (who changed what, with labels),
 *     attachments (upload in a draft, download, access rules), audit logging of personal data,
 *     the transactional outbox (persisted with the transaction, delivered after commit, dropped on
 *     rollback), idempotent message consumers, S/4HANA business partner replication (full load,
 *     events, duplicates, stale events), the blocked-supplier rule and the draft-only creation.
 * Why: [CAP-STAGE-08] acceptance - "change history visible; outbox message persisted then
 *     delivered; attachments upload/download works; tests with idempotency".
 * If missing or unlinked: Plugins could silently stop tracking, logging or delivering after an
 *     upgrade, and a non-idempotent consumer would create duplicates on redelivery.
 */
const { describe, it, before } = require('node:test');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch
const { GET, POST, PUT, PATCH, expect } = test;

const P = '/odata/v4/procurement';
const A = '/odata/v4/admin';
const PO1 = 'd1000000-0000-4000-8000-000000000001'; // alice, Draft
const PO2 = 'd1000000-0000-4000-8000-000000000002'; // alice, Submitted
const SUPPLIER = 'a1000000-0000-4000-8000-000000000001';
const KANTO = 'a1000000-0000-4000-8000-000000000005'; // blocked in S/4HANA, not yet locally
const CONTACT = 'c1000000-0000-4000-8000-000000000001';
const ORDER_APPROVED = 'acme.procurement.PurchaseOrder.Approved.v1';
const BP_CHANGED = 'sap.s4.beh.businesspartner.v1.BusinessPartner.Changed.v1';

const as = (username, headers) => ({ auth: { username, password: '' }, headers });
const fail = (promise) => promise.then(() => { throw new Error('expected an error response'); }, (e) => e);
const active = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)`;
const draft = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=false)`;

/** Polls until fn() returns a truthy value - outbox delivery is asynchronous. */
async function eventually(fn, timeout = 3000) {
  const end = Date.now() + timeout;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Change tracking (stage 08)', () => {
  it('records status changes made by actions, with user, labels and the order number', async () => {
    await POST(`${active(PO2)}/ProcurementService.approve`, { comment: 'ok' }, as('bob'));
    const { data } = await GET(`${active(PO2)}/changes`, as('erin'));
    expect(data.value).to.have.length(1);
    expect(data.value[0]).to.include({
      attribute: 'status', valueChangedFrom: 'Submitted', valueChangedTo: 'Approved', createdBy: 'bob',
      objectID: 'PO-1000002', attributeLabel: 'Status', entityLabel: 'Purchase Order', modification: 'update',
    });
  });

  it('translates the labels', async () => {
    const { data } = await GET(`${active(PO2)}/changes`, as('erin', { 'Accept-Language': 'de' }));
    expect(data.value[0]).to.include({ entityLabel: 'Bestellung', attributeLabel: 'Status' });
  });

  it('records item changes made in a draft when the draft is activated', async () => {
    await POST(`${active(PO1)}/ProcurementService.draftEdit`, { PreserveChanges: true }, as('alice'));
    const { data: items } = await GET(`${draft(PO1)}/items?$select=ID,quantity`, as('alice'));
    await PATCH(`${P}/PurchaseOrderItems(ID=${items.value[0].ID},IsActiveEntity=false)`, { quantity: 7 }, as('alice'));
    await POST(`${draft(PO1)}/ProcurementService.draftActivate`, {}, as('alice'));
    const { data } = await GET(`${P}/PurchaseOrderItems?$filter=parent_ID eq ${PO1}&$expand=changes`, as('alice'));
    const changes = data.value.flatMap((i) => i.changes);
    expect(changes.some((c) => c.attribute === 'quantity' && c.valueChangedTo === '7' && c.createdBy === 'alice')).to.equal(true);
  });
});

describe('Attachments (stage 08)', () => {
  let attachment;
  it('uploads a file into a draft and downloads it after activation', async () => {
    await POST(`${active(PO1)}/ProcurementService.draftEdit`, { PreserveChanges: true }, as('alice'));
    const { data } = await POST(`${draft(PO1)}/attachments`, { filename: 'quote.txt', mimeType: 'text/plain' }, as('alice'));
    attachment = `attachments(up__ID=${PO1},ID=${data.ID},IsActiveEntity=`;
    await PUT(`${draft(PO1)}/${attachment}false)/content`, 'Quote: 4 chairs', as('alice', { 'Content-Type': 'text/plain' }));
    await POST(`${draft(PO1)}/ProcurementService.draftActivate`, {}, as('alice'));

    const { data: list } = await GET(`${active(PO1)}/attachments?$select=filename,status`, as('alice'));
    expect(list.value).to.have.length(1);
    expect(list.value[0]).to.include({ filename: 'quote.txt', status: 'Clean' }); // mocked malware scan
    const { data: content } = await GET(`${active(PO1)}/${attachment}true)/content`, as('alice'));
    expect(String(content)).to.equal('Quote: 4 chairs');
  });

  it('follows the order: other requesters get 404, approvers and auditors may read', async () => {
    expect((await fail(GET(`${active(PO1)}/${attachment}true)/content`, as('fred')))).status).to.equal(404);
    expect((await GET(`${P}/PurchaseOrders_attachments`, as('fred'))).data.value).to.have.length(0);
    expect((await GET(`${active(PO1)}/attachments`, as('erin'))).data.value).to.have.length(1);
  });
});

describe('Audit logging of personal data (stage 08)', () => {
  it('logs PersonalDataModified with old and new value when a contact changes', async () => {
    const events = [];
    const audit = cds.unqueued(await cds.connect.to('audit-log'));
    audit.prepend(() => audit.on('PersonalDataModified', (msg, next) => { events.push(msg.data); return next(); }));

    await PATCH(`${A}/Suppliers(${SUPPLIER})/contacts(${CONTACT})`, { email: 'anna@new.example' }, as('carol'));
    const [log] = await eventually(() => events.length && events);
    expect(log.data_subject).to.deep.include({ role: 'SupplierContact', id: { ID: CONTACT } });
    expect(log.attributes).to.deep.include({ name: 'email', old: 'anna.schmidt@buerotec.example', new: 'anna@new.example' });
    expect(log.user).to.equal('carol');
  });
});

describe('Transactional outbox and idempotent consumer (stage 08)', () => {
  const notifications = (po) => SELECT.from(cds.entities('acme.procurement').Notifications).where({ po_ID: po });

  it('delivers the approval of PO-1000002 (approved above) as exactly one notification', async () => {
    const rows = await eventually(async () => { const r = await notifications(PO2); return r.length && r; });
    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({ orderNo: 'PO-1000002', recipient: 'Buyer' });
    expect((await GET(`${P}/Notifications`, as('carol'))).data.value).to.have.length(1);
    expect((await fail(GET(`${P}/Notifications`, as('alice')))).status).to.equal(403);
  });

  it('stores the message in cds.outbox.Messages inside the transaction and delivers it after commit', async () => {
    const ID = cds.utils.uuid();
    const messaging = await cds.connect.to('messaging');
    await cds.tx(async (tx) => {
      await messaging.emit(ORDER_APPROVED, { ID, orderNo: 'PO-7000001', approver: 'bob' });
      const queued = await tx.run(SELECT.from('cds.outbox.Messages'));
      expect(queued.some((m) => m.msg.includes(ID))).to.equal(true); // persisted with the business data
      expect(await notifications(ID)).to.have.length(0); // not delivered before commit
    });
    expect(await eventually(async () => (await notifications(ID)).length)).to.equal(1);
  });

  it('drops the message when the transaction rolls back', async () => {
    const ID = cds.utils.uuid();
    const messaging = await cds.connect.to('messaging');
    await cds.tx(async () => {
      await messaging.emit(ORDER_APPROVED, { ID, orderNo: 'PO-7000002', approver: 'bob' });
      throw new Error('business rule failed after emit');
    }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await notifications(ID)).to.have.length(0);
    expect((await SELECT.from('cds.outbox.Messages')).some((m) => m.msg.includes(ID))).to.equal(false);
  });

  it('ignores a redelivered message (at-least-once delivery)', async () => {
    const ID = cds.utils.uuid();
    const messaging = cds.unqueued(await cds.connect.to('messaging'));
    const msg = { ID, orderNo: 'PO-7000003', approver: 'bob' };
    await messaging.emit(ORDER_APPROVED, msg);
    await messaging.emit(ORDER_APPROVED, msg); // same message again
    expect(await notifications(ID)).to.have.length(1);
  });
});

describe('S/4HANA business partner replication (stage 08)', () => {
  const supplier = (bpNumber) => SELECT.one.from(cds.entities('acme.procurement').Suppliers).where({ bpNumber });
  let bp;
  before(async () => { bp = await cds.connect.to('API_BUSINESS_PARTNER'); });

  it('accepts orders for Kanto before replication (local copy not yet blocked)', async () => {
    expect((await POST(`${P}/PurchaseOrders`, { supplier_ID: KANTO }, as('alice'))).status).to.equal(201);
  });

  it('full load: creates new partners, updates changed ones, leaves the rest (Admin only)', async () => {
    expect((await fail(POST(`${A}/replicateSuppliers`, {}, as('carol')))).status).to.equal(403);
    const { data } = await POST(`${A}/replicateSuppliers`, {}, as('dave'));
    expect(data).to.include({ created: 1, updated: 1, unchanged: 4 });
    expect(await supplier('17100005')).to.include({ name: 'Kanto Electronics KK', blocked: true });
    expect(await supplier('17100006')).to.include({ name: 'Nordic Paper AB', country_code: 'SE' });
  });

  it('is idempotent: a second full load changes nothing', async () => {
    const { data } = await POST(`${A}/replicateSuppliers`, {}, as('dave'));
    expect(data).to.include({ created: 0, updated: 0, unchanged: 6 });
  });

  it('rejects new orders for a supplier blocked in S/4HANA', async () => {
    const err = await fail(POST(`${P}/PurchaseOrders`, { supplier_ID: KANTO }, as('alice', { 'Accept-Language': 'de' })));
    expect(err.status).to.equal(400);
    expect(err.message).to.contain('Der Lieferant Kanto Electronics KK ist in S/4HANA gesperrt');
  });

  it('replicates a change event once; duplicates and stale events are ignored', async () => {
    const { A_BusinessPartner } = bp.entities;
    await bp.run(UPDATE(A_BusinessPartner).set({ BusinessPartnerFullName: 'Pacific Office Supply LLC', LastChangeDate: '2026-11-20' }).where({ BusinessPartner: '17100002' }));
    const messaging = cds.unqueued(await cds.connect.to('messaging'));

    await messaging.emit(BP_CHANGED, { BusinessPartner: '17100002' });
    const first = await supplier('17100002');
    expect(first).to.include({ name: 'Pacific Office Supply LLC', bpLastChanged: '2026-11-20' });

    await messaging.emit(BP_CHANGED, { BusinessPartner: '17100002' }); // duplicate
    expect((await supplier('17100002')).modifiedAt).to.equal(first.modifiedAt);

    // stale: S/4HANA data older than the local copy (e.g. an event that overtook another one)
    await bp.run(UPDATE(A_BusinessPartner).set({ BusinessPartnerFullName: 'Old Name', LastChangeDate: '2026-01-01' }).where({ BusinessPartner: '17100002' }));
    await messaging.emit(BP_CHANGED, { BusinessPartner: '17100002' });
    expect((await supplier('17100002')).name).to.equal('Pacific Office Supply LLC');
  });

  it('answers 502 without remote details when S/4HANA fails (keep this test last - it breaks the mock)', async () => {
    bp.prepend(() => bp.on('READ', () => { throw new Error('ECONNREFUSED 10.0.0.1:443'); }));
    const err = await fail(POST(`${A}/replicateSuppliers`, {}, as('dave')));
    expect(err.status).to.equal(502);
    expect(err.message).to.not.contain('ECONNREFUSED');
  });
});

describe('Orders are created as drafts only (stage 08)', () => {
  it('rejects POST with IsActiveEntity: true - and the server keeps running', async () => {
    const err = await fail(POST(`${P}/PurchaseOrders`, { IsActiveEntity: true, supplier_ID: SUPPLIER }, as('alice')));
    expect(err.status).to.equal(400);
    expect(err.message).to.contain('Purchase orders are created as drafts');
    expect((await GET(`${P}/PurchaseOrders?$top=1`, as('alice'))).status).to.equal(200);
  });
});

describe('Telemetry (stage 08)', () => {
  it('is configured (console exporter in development)', () => {
    expect(cds.env.requires.telemetry.kind).to.equal('telemetry-to-console');
  });
});
