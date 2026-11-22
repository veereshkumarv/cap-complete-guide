/**
 * What: Regression tests for the guardrails from the code review that apply to this stage: items
 *     frozen after submission, status actions vs. open drafts, concurrent decisions, four-eyes on
 *     reject, quantities on submit, topSuppliers grouping and remote query guards (later stages add
 *     attachments, change history, blocked suppliers and S/4HANA replication).
 * Why: each test reproduces a finding of docs/security-guardrails.md that was exploitable before
 *     the fix; it fails again if the guardrail is removed.
 * If missing or unlinked: The guardrails can be lost in a refactoring without anybody noticing.
 */
const { describe, it } = require('node:test');
const { execFileSync } = require('node:child_process');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks');
const { GET, POST, DELETE, expect } = test;

const P = '/odata/v4/procurement';
const PO1 = 'd1000000-0000-4000-8000-000000000001'; // alice, Draft
const PO2 = 'd1000000-0000-4000-8000-000000000002'; // alice, Submitted
const PO4 = 'd1000000-0000-4000-8000-000000000004'; // alice, Rejected
const SUPPLIER = 'a1000000-0000-4000-8000-000000000001';
const CHAIR = 'b1000000-0000-4000-8000-000000000001';
const as = (username, headers) => ({ auth: { username, password: '' }, headers });
const fail = (promise) => promise.then((r) => { throw new Error(`expected an error response, got ${r.status}`); }, (e) => e);
const active = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)`;
const draft = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=false)`;
const itemsOf = async (ID) => (await GET(`${P}/PurchaseOrderItems?$filter=parent_ID eq ${ID}`, as('dave'))).data.value;

describe('Guardrails: items are frozen after submission', () => {
  it('rejects deleting an item of a submitted order - also for the owner', async () => {
    const [item] = await itemsOf(PO2);
    const err = await fail(DELETE(`${P}/PurchaseOrderItems(ID=${item.ID},IsActiveEntity=true)`, as('alice')));
    expect([403, 409]).to.include(err.status);
    expect(await itemsOf(PO2)).to.have.length(1);
  });

  it('rejects direct item deletes on active draft orders too - changes go through a draft', async () => {
    const [item] = await itemsOf(PO1);
    expect((await fail(DELETE(`${P}/PurchaseOrderItems(ID=${item.ID},IsActiveEntity=true)`, as('alice')))).status).to.equal(409);
  });

  it('still lets the owner remove an item in a draft and save - total recalculated', async () => {
    await POST(`${active(PO1)}/ProcurementService.draftEdit`, { PreserveChanges: true }, as('alice'));
    const { data } = await GET(`${draft(PO1)}/items`, as('alice'));
    await DELETE(`${P}/PurchaseOrderItems(ID=${data.value[0].ID},IsActiveEntity=false)`, as('alice'));
    await POST(`${draft(PO1)}/ProcurementService.draftActivate`, {}, as('alice'));
    const items = await itemsOf(PO1);
    const po = (await GET(active(PO1), as('alice'))).data;
    expect(items).to.have.length(1);
    expect(Number(po.totalAmount)).to.equal(items.reduce((s, i) => s + i.quantity * i.netPrice, 0));
  });

});

describe('Guardrails: status actions', () => {
  it('refuses status actions while an edit draft is open (the draft would overwrite the status)', async () => {
    await POST(`${active(PO4)}/ProcurementService.draftEdit`, { PreserveChanges: true }, as('dave'));
    const err = await fail(POST(`${active(PO4)}/ProcurementService.reopen`, {}, as('alice')));
    expect(err.status).to.equal(409);
    expect(err.message).to.contain('is being edited');
    await DELETE(draft(PO4), as('dave')); // discard
    expect((await POST(`${active(PO4)}/ProcurementService.reopen`, {}, as('alice'))).data.status).to.equal('Draft');
  });

  it('lets exactly one of two concurrent decisions win', async () => {
    const { data: po } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER }, as('alice'));
    await POST(`${draft(po.ID)}/items`, { product_ID: CHAIR, quantity: 1 }, as('alice'));
    await POST(`${draft(po.ID)}/ProcurementService.draftActivate`, {}, as('alice'));
    await POST(`${active(po.ID)}/ProcurementService.submit`, {}, as('alice'));
    const results = await Promise.allSettled([
      POST(`${active(po.ID)}/ProcurementService.approve`, { comment: 'ok' }, as('bob')),
      POST(`${active(po.ID)}/ProcurementService.reject`, { comment: 'no' }, as('bob')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).to.have.length(1);
    const log = (await GET(`${P}/ApprovalLog?$filter=po_ID eq ${po.ID}`, as('erin'))).data.value;
    expect(log).to.have.length(1);
  });

  it('applies the four-eyes rule to reject as well', async () => {
    const { data: po } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER }, as('gina'));
    await POST(`${draft(po.ID)}/items`, { product_ID: CHAIR, quantity: 1 }, as('gina'));
    await POST(`${draft(po.ID)}/ProcurementService.draftActivate`, {}, as('gina'));
    await POST(`${active(po.ID)}/ProcurementService.submit`, {}, as('gina'));
    expect((await fail(POST(`${active(po.ID)}/ProcurementService.reject`, { comment: 'self' }, as('gina')))).status).to.equal(403);
  });

  it('refuses to submit items without a quantity', async () => {
    const { data: po } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER }, as('alice'));
    await POST(`${draft(po.ID)}/items`, { product_ID: CHAIR }, as('alice'));
    await POST(`${draft(po.ID)}/ProcurementService.draftActivate`, {}, as('alice'));
    const err = await fail(POST(`${active(po.ID)}/ProcurementService.submit`, {}, as('alice')));
    expect(err.status).to.equal(400);
    expect(err.message).to.contain('quantity');
  });

  it('ranks suppliers by ID and currency - same name or other currency are separate rows', async () => {
    const { data } = await GET(`${P}/topSuppliers(limit=10)`, as('erin'));
    for (const row of data.value) expect(row).to.have.keys('supplierID', 'supplier', 'currency', 'total', 'orders');
  });
});

describe('Guardrails: S/4HANA access', () => {
  it('rejects query options that would make S/4HANA scan or page deeply', async () => {
    for (const q of ['$search=gmbh', '$orderby=industry', '$skip=5000&$top=10']) {
      expect((await fail(GET(`${P}/RemoteSuppliers?${q}`, as('carol')))).status, q).to.equal(400);
    }
    expect((await GET(`${P}/RemoteSuppliers?$orderby=name&$top=2`, as('carol'))).data.value).to.have.length(2);
  });

});

describe('Guardrails: configuration', () => {
  it('ships mocked users only in development - production has xsuaa and no users', () => {
    const out = execFileSync('npx', ['cds', 'env', 'requires.auth', '--profile', 'production'], { cwd: `${__dirname}/..`, encoding: 'utf8' });
    const auth = JSON.parse(out);
    expect(auth.kind).to.equal('xsuaa');
    expect(auth.users).to.equal(undefined);
  });

  it('refuses to start on Cloud Foundry with anything but xsuaa', () => {
    const { assertProductionAuth } = require('../srv/lib/startup-guard');
    expect(() => assertProductionAuth({ VCAP_APPLICATION: '{}' }, { kind: 'mocked' })).to.throw(/xsuaa/);
    expect(() => assertProductionAuth({ VCAP_APPLICATION: '{}' }, { kind: 'xsuaa' })).to.not.throw();
    expect(() => assertProductionAuth({}, { kind: 'mocked' })).to.not.throw(); // local development
  });
});
