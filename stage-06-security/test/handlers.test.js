/**
 * What: Tests of the generic handler logic: order numbers from the number range, draft defaults,
 *     price defaulting from the product, live draft totals on item create/update/delete, totals on
 *     activation and item validation messages.
 * Why: [CAP-STAGE-04] acceptance "total computed"; these rules run on every request and must hold
 *     for drafts and active data alike.
 * If missing or unlinked: Wrong totals or duplicate order numbers reach users unnoticed.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch
const { GET, POST, PATCH, DELETE, expect } = test;
test.defaults.auth = { username: 'alice', password: '' }; // stage 06: every request needs a user; alice = Requester

const P = '/odata/v4/procurement';
const SUPPLIER = 'a1000000-0000-4000-8000-000000000001';
const CHAIR = 'b1000000-0000-4000-8000-000000000001'; // 189.90
const DESK = 'b1000000-0000-4000-8000-000000000002'; // 549.00
const draftOf = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=false)`;
const fail = (promise) => promise.then(() => { throw new Error('expected an error response'); }, (e) => e);

describe('Handlers (stage 04)', () => {
  it('numbers new drafts from the number range and sets defaults', async () => {
    const { data: a } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER });
    const { data: b } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER });
    expect(a.orderNo).to.match(/^PO-\d{7}$/);
    expect(Number(b.orderNo.slice(3))).to.equal(Number(a.orderNo.slice(3)) + 1);
    expect(a).to.include({ currency_code: 'EUR', status: 'Draft' });
    expect(Number(a.totalAmount)).to.equal(0);
  });

  it('ignores an order number sent by the client (@readonly)', async () => {
    const { data } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER, orderNo: 'HACKED' });
    expect(data.orderNo).to.not.equal('HACKED');
  });

  it('defaults the net price and keeps the draft total current', async () => {
    const { data: po } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER });
    const { data: chair } = await POST(`${draftOf(po.ID)}/items`, { product_ID: CHAIR, quantity: 2 });
    expect(Number(chair.netPrice)).to.equal(189.9);
    await POST(`${draftOf(po.ID)}/items`, { product_ID: DESK, quantity: 1 });
    expect(Number((await GET(draftOf(po.ID))).data.totalAmount)).to.equal(928.8);

    await PATCH(`${P}/PurchaseOrderItems(ID=${chair.ID},IsActiveEntity=false)`, { quantity: 4 });
    expect(Number((await GET(draftOf(po.ID))).data.totalAmount)).to.equal(1308.6);

    await DELETE(`${P}/PurchaseOrderItems(ID=${chair.ID},IsActiveEntity=false)`);
    expect(Number((await GET(draftOf(po.ID))).data.totalAmount)).to.equal(549);

    await POST(`${draftOf(po.ID)}/ProcurementService.draftActivate`, {});
    const { data: active } = await GET(`${P}/PurchaseOrders(ID=${po.ID},IsActiveEntity=true)`);
    expect(Number(active.totalAmount)).to.equal(549);
  });

  it('rejects unknown products and negative prices with localized messages', async () => {
    const { data: po } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER });
    const unknown = await fail(POST(`${draftOf(po.ID)}/items`, { product_ID: 'b1000000-0000-4000-8000-0000000000ff', quantity: 1 }));
    expect(unknown.status).to.equal(400);
    expect(unknown.message).to.contain('does not exist');
    const negative = await fail(POST(`${draftOf(po.ID)}/items`, { product_ID: CHAIR, quantity: 1, netPrice: -1 }, { headers: { 'Accept-Language': 'de' } }));
    expect(negative.status).to.equal(400);
    expect(negative.message).to.contain('Der Nettopreis darf nicht negativ sein.');
  });

  it('computes the total when an order is created directly with items (no draft)', async () => {
    const { PurchaseOrders } = cds.entities('ProcurementService');
    const srv = await cds.connect.to('ProcurementService');
    const ID = cds.utils.uuid();
    // internal call without an HTTP request: run it as a privileged (technical) user
    await srv.tx({ user: cds.User.privileged }, (tx) => tx.run(INSERT.into(PurchaseOrders).entries({ ID, supplier_ID: SUPPLIER, items: [{ product_ID: CHAIR, quantity: 3, netPrice: 10.1 }] })));
    const po = await SELECT.one.from(PurchaseOrders).where({ ID });
    expect(Number(po.totalAmount)).to.equal(30.3);
  });
});
