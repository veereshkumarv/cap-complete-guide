/**
 * What: Tests of the draft-workflow sample: draft round trip with a live total, activation, the
 *     submit/approve/reject state machine (409 on invalid transitions, 400 for missing items or
 *     reason), actions on drafts, status colours, and the UI annotations in $metadata.
 * Why: [CAP-S07] proves the three concepts of the sample (draft, actions, side effects) through the
 *     same OData requests the Fiori app sends.
 * If missing or unlinked: A broken total or state machine is only found by clicking through the app.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, PATCH, DELETE, expect } = cds.test(`${__dirname}/..`);

const S = '/odata/v4/expenses';
const draft = (ID) => `${S}/ExpenseReports(ID=${ID},IsActiveEntity=false)`;
const active = (ID) => `${S}/ExpenseReports(ID=${ID},IsActiveEntity=true)`;
const fail = (p) => p.then(() => { throw new Error('expected an error response'); }, (e) => e);
const R1 = 'e1000000-0000-4000-8000-000000000001'; // Draft
const R2 = 'e1000000-0000-4000-8000-000000000002'; // Submitted

describe('Draft editing with a live total', () => {
  let ID;
  it('creates a draft and keeps the total current while items change', async () => {
    ({ data: { ID } } = await POST(`${S}/ExpenseReports`, { title: 'Conference', currency_code: 'EUR' }));
    const { data: a } = await POST(`${draft(ID)}/items`, { category: 'Travel', amount: 120.1 });
    await POST(`${draft(ID)}/items`, { category: 'Hotel', amount: 200.2 });
    expect(Number((await GET(draft(ID))).data.total)).to.equal(320.3);

    await PATCH(`${S}/ExpenseItems(ID=${a.ID},IsActiveEntity=false)`, { amount: 99.9 });
    expect(Number((await GET(draft(ID))).data.total)).to.equal(300.1);
    await DELETE(`${S}/ExpenseItems(ID=${a.ID},IsActiveEntity=false)`);
    expect(Number((await GET(draft(ID))).data.total)).to.equal(200.2);
  });

  it('activates the draft with the stored total', async () => {
    await POST(`${draft(ID)}/ExpenseService.draftActivate`, {});
    const { data } = await GET(active(ID));
    expect(data).to.include({ status: 'Draft', statusCriticality: 0 });
    expect(Number(data.total)).to.equal(200.2);
  });

  it('validates @assert.range when the draft is saved, not while typing', async () => {
    await POST(`${active(R1)}/ExpenseService.draftEdit`, { PreserveChanges: true });
    await POST(`${draft(R1)}/items`, { amount: 0 }); // drafts may be incomplete or invalid
    const err = await fail(POST(`${draft(R1)}/ExpenseService.draftActivate`, {}));
    expect(err.status).to.equal(400);
    await DELETE(draft(R1)); // discard the draft - the active report is unchanged
    expect(Number((await GET(active(R1))).data.total)).to.equal(412.5);
  });
});

describe('State machine via bound actions', () => {
  it('submit: Draft -> Submitted, a second submit is 409', async () => {
    expect((await POST(`${active(R1)}/ExpenseService.submit`, {})).data).to.include({ status: 'Submitted', statusCriticality: 2 });
    expect((await fail(POST(`${active(R1)}/ExpenseService.submit`, {}))).status).to.equal(409);
  });

  it('cannot submit a report without expenses (400)', async () => {
    const { data } = await POST(`${S}/ExpenseReports`, { title: 'Empty' });
    await POST(`${draft(data.ID)}/ExpenseService.draftActivate`, {});
    expect((await fail(POST(`${active(data.ID)}/ExpenseService.submit`, {}))).status).to.equal(400);
  });

  it('approve: Submitted -> Approved; reject needs a reason', async () => {
    expect((await POST(`${active(R1)}/ExpenseService.approve`, {})).data.status).to.equal('Approved');
    expect((await fail(POST(`${active(R2)}/ExpenseService.reject`, {}))).status).to.equal(400);
    const { data } = await POST(`${active(R2)}/ExpenseService.reject`, { reason: 'Receipts missing' });
    expect(data).to.include({ status: 'Rejected', reason: 'Receipts missing', statusCriticality: 1 });
  });

  it('refuses actions on a draft instance (409) and status changes via PATCH', async () => {
    const { data } = await POST(`${S}/ExpenseReports`, { title: 'Draft only' });
    expect((await fail(POST(`${draft(data.ID)}/ExpenseService.submit`, {}))).status).to.equal(409);
    await PATCH(draft(data.ID), { status: 'Approved' }); // @readonly: silently ignored
    expect((await GET(draft(data.ID))).data.status).to.equal('Draft');
  });
});

describe('Fiori app and annotations', () => {
  it('serves the app and publishes side effects and action availability', async () => {
    expect((await GET('/expenses/webapp/manifest.json')).status).to.equal(200);
    const { data } = await GET(`${S}/$metadata`);
    for (const term of ['UI.LineItem', 'UI.Facets', 'UI.HeaderFacets', 'Common.SideEffects', 'Core.OperationAvailable']) {
      expect(data, term).to.contain(`Term="${term}"`);
    }
    expect(data).to.match(/<PropertyPath>total<\/PropertyPath>|<String>total<\/String>/);
  });
});
