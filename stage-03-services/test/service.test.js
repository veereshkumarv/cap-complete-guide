/**
 * What: API tests for stage 03: $metadata of both services, reads with $expand, the draft round
 *     trip (create draft, add item, activate, edit active order) and AdminService deep insert.
 * Why: [CAP-STAGE-03] acceptance - valid $metadata, READ with $expand=items and draft create via
 *     POST + draftActivate; documents the exact draft URLs a Fiori app uses.
 * If missing or unlinked: Changes to projections or draft configuration break the API contract
 *     without a failing test.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, PATCH, expect } = cds.test(`${__dirname}/..`);

const P = '/odata/v4/procurement';
const SUPPLIER = 'a1000000-0000-4000-8000-000000000001';
const CHAIR = 'b1000000-0000-4000-8000-000000000001';

describe('ProcurementService (stage 03)', () => {
  it('publishes $metadata with draft-enabled PurchaseOrders', async () => {
    const { data } = await GET(`${P}/$metadata`);
    expect(data).to.contain('<EntitySet Name="PurchaseOrders" EntityType="ProcurementService.PurchaseOrders">');
    expect(data).to.contain('<Annotations Target="ProcurementService.EntityContainer/PurchaseOrders">');
    expect(data).to.contain('Common.DraftRoot');
  });

  it('reads orders with $expand=items and exposes only projected supplier fields', async () => {
    const { data } = await GET(`${P}/PurchaseOrders?$filter=orderNo eq 'PO-1000001'&$expand=items,supplier`);
    const [po] = data.value;
    expect(po.items).to.have.length(2);
    expect(po.IsActiveEntity).to.equal(true);
    expect(Object.keys(po.supplier).sort()).to.deep.equal(['ID', 'country_code', 'name']);
  });

  it('creates a draft, adds an item and activates it (draft round trip)', async () => {
    // 1. POST on the entity set creates a draft (IsActiveEntity=false)
    const { data: draft } = await POST(`${P}/PurchaseOrders`, { supplier_ID: SUPPLIER, currency_code: 'EUR' });
    expect(draft.IsActiveEntity).to.equal(false);
    expect(draft.status).to.equal('Draft');
    const key = `ID=${draft.ID},IsActiveEntity=false`;

    // 2. items are created inside the draft via the composition
    await POST(`${P}/PurchaseOrders(${key})/items`, { product_ID: CHAIR, quantity: 3, netPrice: 189.9 });

    // 3. draftActivate turns the draft into the active order
    const { data: active } = await POST(`${P}/PurchaseOrders(${key})/ProcurementService.draftActivate`, {});
    expect(active.IsActiveEntity).to.equal(true);
    const { data: read } = await GET(`${P}/PurchaseOrders(ID=${draft.ID},IsActiveEntity=true)?$expand=items`);
    expect(read.items).to.have.length(1);
    expect(Number(read.items[0].itemAmount)).to.equal(569.7);
  });

  it('edits an active order through draftEdit and keeps the active version until activation', async () => {
    const ID = 'd1000000-0000-4000-8000-000000000001';
    const { data: draft } = await POST(`${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)/ProcurementService.draftEdit`, { PreserveChanges: true });
    expect(draft.IsActiveEntity).to.equal(false);
    await PATCH(`${P}/PurchaseOrders(ID=${ID},IsActiveEntity=false)`, { currency_code: 'USD' });
    const { data: stillActive } = await GET(`${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)`);
    expect(stillActive.currency_code).to.equal('EUR');
    await POST(`${P}/PurchaseOrders(ID=${ID},IsActiveEntity=false)/ProcurementService.draftActivate`, {});
    const { data: after } = await GET(`${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)`);
    expect(after.currency_code).to.equal('USD');
  });

  it('refuses to activate a draft without the mandatory supplier', async () => {
    const { data: draft } = await POST(`${P}/PurchaseOrders`, {});
    const err = await POST(`${P}/PurchaseOrders(ID=${draft.ID},IsActiveEntity=false)/ProcurementService.draftActivate`, {}).catch((e) => e);
    expect(err.status).to.equal(400);
  });

  it('keeps products read-only in the procurement service', async () => {
    const err = await POST(`${P}/Products`, { name: 'x' }).catch((e) => e);
    expect(err.status).to.equal(405);
  });
});

describe('AdminService (stage 03)', () => {
  it('creates a supplier with contacts in one request (deep insert of the composition)', async () => {
    const { status, data } = await POST('/odata/v4/admin/Suppliers', {
      name: 'Nordic Paper AB', country_code: 'DE', rating: 4,
      contacts: [{ name: 'Elsa Berg', email: 'elsa.berg@nordic.example' }],
    });
    expect(status).to.equal(201);
    const { data: read } = await GET(`/odata/v4/admin/Suppliers(${data.ID})?$expand=contacts`);
    expect(read.contacts[0].name).to.equal('Elsa Berg');
  });

  it('rejects an out-of-range rating (@assert.range)', async () => {
    const err = await POST('/odata/v4/admin/Suppliers', { name: 'Bad Rating Ltd', rating: 9 }).catch((e) => e);
    expect(err.status).to.equal(400);
  });
});
