/**
 * What: Tests of the PO status actions: every valid transition, invalid transitions (409) with
 *     English and German messages, four-eyes rule, mandatory reject comment, submit without items,
 *     actions on drafts, the approval log, the POApproved event and the topSuppliers function.
 * Why: [CAP-STAGE-04] acceptance - "state machine test (invalid transitions -> 409); error messages
 *     localized"; the workflow is the core business contract of the app.
 * If missing or unlinked: A broken transition or a lost approval-log entry ships unnoticed.
 */
const { describe, it, before } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, expect } = cds.test(`${__dirname}/..`, "--with-mocks"); // mock API_BUSINESS_PARTNER like cds watch

const P = '/odata/v4/procurement';
const PO1 = 'd1000000-0000-4000-8000-000000000001'; // PO-1000001, Draft, created by alice
const PO2 = 'd1000000-0000-4000-8000-000000000002'; // PO-1000002, Submitted, created by alice
const as = (user, headers = {}) => ({ auth: { username: user, password: '' }, headers });
const act = (ID, action, body = {}, user = 'alice', headers) =>
  POST(`${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)/ProcurementService.${action}`, body, as(user, headers));
const fail = (promise) => promise.then(() => { throw new Error('expected an error response'); }, (e) => e);

describe('PO status actions (stage 04)', () => {
  /** @type {any[]} */
  const events = [];
  before(async () => {
    const srv = await cds.connect.to('ProcurementService');
    srv.on('POApproved', (msg) => { events.push(msg.data); });
  });

  it('submit: Draft -> Submitted', async () => {
    const { data } = await act(PO1, 'submit');
    expect(data.status).to.equal('Submitted');
  });

  it('rejects an invalid transition with 409 and a localized message', async () => {
    const en = await fail(act(PO1, 'submit'));
    expect(en.status).to.equal(409);
    expect(en.message).to.contain('Purchase order PO-1000001 is in status Submitted; the action "submit" is not allowed.');
    const de = await fail(act(PO1, 'send', {}, 'alice', { 'Accept-Language': 'de' }));
    expect(de.message).to.contain('Die Bestellung PO-1000001 hat den Status Submitted; die Aktion "send" ist nicht erlaubt.');
  });

  it('enforces the four-eyes principle: the requester cannot approve', async () => {
    const err = await fail(act(PO1, 'approve', { comment: 'self' }, 'alice'));
    expect(err.status).to.equal(403);
    expect(err.message).to.contain('four-eyes');
  });

  it('approve: Submitted -> Approved, writes the approval log and emits POApproved', async () => {
    const { data } = await act(PO1, 'approve', { comment: 'Budget available' }, 'bob');
    expect(data.status).to.equal('Approved');
    const { data: log } = await GET(`${P}/ApprovalLog?$filter=po_ID eq ${PO1}`);
    expect(log.value).to.have.length(1);
    expect(log.value[0]).to.include({ approver: 'bob', decision: 'Approved', comment: 'Budget available' });
    expect(events).to.deep.include({ ID: PO1, orderNo: 'PO-1000001', approver: 'bob' });
  });

  it('send: Approved -> SentToSupplier', async () => {
    const { data } = await act(PO1, 'send', {}, 'bob');
    expect(data.status).to.equal('SentToSupplier');
  });

  it('reject needs a comment; reject -> Rejected; reopen -> Draft', async () => {
    const err = await fail(act(PO2, 'reject', {}, 'bob'));
    expect(err.status).to.equal(400);
    expect((await act(PO2, 'reject', { comment: 'Wrong supplier' }, 'bob')).data.status).to.equal('Rejected');
    expect((await act(PO2, 'reopen')).data.status).to.equal('Draft');
  });

  it('cannot submit an order without items', async () => {
    const { data: draft } = await POST(`${P}/PurchaseOrders`, { supplier_ID: 'a1000000-0000-4000-8000-000000000002' });
    await POST(`${P}/PurchaseOrders(ID=${draft.ID},IsActiveEntity=false)/ProcurementService.draftActivate`, {});
    const err = await fail(act(draft.ID, 'submit'));
    expect(err.status).to.equal(400);
    expect(err.message).to.contain(`Add at least one item before submitting purchase order ${draft.orderNo}.`);
  });

  it('refuses status actions on a draft instance', async () => {
    const { data: draft } = await POST(`${P}/PurchaseOrders`, { supplier_ID: 'a1000000-0000-4000-8000-000000000002' });
    const err = await fail(POST(`${P}/PurchaseOrders(ID=${draft.ID},IsActiveEntity=false)/ProcurementService.submit`, {}));
    expect(err.message).to.contain('Save the purchase order before changing its status.');
    expect(err.status).to.equal(409);
  });
});

describe('topSuppliers function (stage 04)', () => {
  it('ranks suppliers by approved and sent order value', async () => {
    const { data } = await GET(`${P}/topSuppliers(limit=5)`);
    expect(data.value.map((r) => r.supplier)).to.deep.equal(['Bürotec GmbH', 'Bharat Tech Distributors']);
    expect(Number(data.value[0].total)).to.equal(1308.6);
  });

  it('validates the limit parameter', async () => {
    const err = await fail(GET(`${P}/topSuppliers(limit=0)`));
    expect(err.status).to.equal(400);
  });
});
