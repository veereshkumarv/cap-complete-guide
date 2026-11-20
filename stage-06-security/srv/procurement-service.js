/**
 * What: Implementation of ProcurementService: order numbers and defaults for new drafts, price
 *     defaulting and validation of items, live and final order totals, the five status actions with
 *     approval log and four-eyes rule, the topSuppliers function, the POApproved event and the
 *     delegation of RemoteSuppliers to the S/4HANA Business Partner API, and the UI hints
 *     statusCriticality (status colour) and canEdit (Edit/Delete buttons per user) for the Fiori app.
 * Why: [CAP-M05] [CAP-M06] [CAP-M07] [CAP-M08] - rules that annotations cannot express live here
 *     (CAP-DEC-02); every message is an i18n key from _i18n/messages*.properties.
 * If missing or unlinked: CAP serves the generic CRUD only - orders get no number or total, actions
 *     answer 501 "not implemented" and RemoteSuppliers returns nothing.
 */
const cds = require('@sap/cds');
const { nextStatus, criticality } = require('./lib/status');
const { canEdit } = require('./lib/permissions');
const { nextNumber } = require('./lib/number-range');
const { sumItems, recalculate } = require('./lib/totals');

const LOG = cds.log('procurement');

module.exports = class ProcurementService extends cds.ApplicationService {
  async init() {
    const { PurchaseOrders, PurchaseOrderItems, Products, RemoteSuppliers } = this.entities;

    // ---- drafts: number and defaults when a requester starts a new order
    this.before('NEW', PurchaseOrders.drafts, async (req) => {
      req.data.orderNo = await nextNumber('PurchaseOrder');
      req.data.currency_code ??= 'EUR';
      req.data.totalAmount = 0;
    });

    // ---- items: default the net price from the product, validate the price
    this.before(['NEW', 'CREATE', 'UPDATE'], [PurchaseOrderItems.drafts, PurchaseOrderItems], async (req) => {
      const { product_ID, netPrice } = req.data;
      if (netPrice !== undefined && netPrice !== null && Number(netPrice) < 0) {
        req.error({ status: 400, message: 'NEGATIVE_PRICE', target: 'netPrice' });
      }
      if (!product_ID) return;
      const product = await SELECT.one.from(Products).columns('price').where({ ID: product_ID });
      if (!product) return req.error({ status: 400, message: 'PRODUCT_NOT_FOUND', args: [product_ID], target: 'product_ID' });
      if (netPrice === undefined || netPrice === null) req.data.netPrice = product.price;
    });

    // ---- live total while editing a draft (the UI refreshes it via side effects in stage 05)
    const parentOfDraftItem = new WeakMap();
    this.before(['UPDATE', 'DELETE'], PurchaseOrderItems.drafts, async (req) => {
      const item = await SELECT.one.from(PurchaseOrderItems.drafts).columns('parent_ID').where({ ID: req.data.ID });
      if (item) parentOfDraftItem.set(req, item.parent_ID);
    });
    this.after(['NEW', 'UPDATE', 'DELETE'], PurchaseOrderItems.drafts, async (result, req) => {
      const parent = req.data.parent_ID ?? parentOfDraftItem.get(req);
      if (parent) await recalculate(PurchaseOrders.drafts, PurchaseOrderItems.drafts, parent);
    });

    // ---- activation (and any direct write): the stored total always matches the items
    this.before(['CREATE', 'UPDATE'], PurchaseOrders, (req) => {
      if (Array.isArray(req.data.items)) req.data.totalAmount = sumItems(req.data.items);
    });

    // ---- UI: colour of the status and per-user Edit/Delete buttons ([CAP-M09], [CAP-M11])
    // Virtual elements are computed from stored columns; Fiori only $selects what it displays, so
    // make sure the inputs are read whenever a virtual element is requested.
    const INPUTS = { statusCriticality: ['status'], canEdit: ['status', 'createdBy'] };
    this.before('READ', [PurchaseOrders, PurchaseOrders.drafts], (req) => {
      const columns = req.query.SELECT.columns;
      if (!columns || columns.some((c) => c === '*')) return;
      const has = (name) => columns.some((c) => c.ref?.[0] === name);
      for (const [virtual, inputs] of Object.entries(INPUTS)) {
        if (has(virtual)) for (const name of inputs) if (!has(name)) columns.push({ ref: [name] });
      }
    });
    this.after('READ', [PurchaseOrders, PurchaseOrders.drafts], (rows, req) => {
      for (const row of [rows].flat()) {
        if (!row?.status) continue;
        row.statusCriticality = criticality(row.status);
        row.canEdit = canEdit(req.user, row);
      }
    });

    // ---- status actions ([CAP-DEC-03]: transitions only through actions)
    for (const action of ['submit', 'approve', 'reject', 'send', 'reopen']) {
      this.on(action, PurchaseOrders, (req) => this.changeStatus(action, req));
      // Bound actions on a draft instance are dispatched to the .drafts entity; without this
      // handler CAP answers 501 "not implemented" instead of a meaningful message.
      this.on(action, PurchaseOrders.drafts, (req) => req.reject({ status: 409, message: 'ORDER_IN_DRAFT' }));
    }

    // ---- read-only computation
    this.on('topSuppliers', async (req) => {
      const limit = req.data.limit ?? 5;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return req.reject({ status: 400, message: 'INVALID_LIMIT', target: 'limit' });
      }
      return SELECT.from(PurchaseOrders)
        .columns('supplier.name as supplier', 'sum(totalAmount) as total', 'count(1) as orders')
        .where({ status: { in: ['Approved', 'SentToSupplier'] } })
        .groupBy('supplier.name')
        .orderBy('total desc')
        .limit(limit);
    });

    // ---- in-process event consumer ([CAP-DEC-04]); stage 08 moves delivery to an outbox
    this.on('POApproved', (msg) => {
      LOG.info('purchase order approved', { orderNo: msg.data.orderNo, approver: msg.data.approver });
    });

    // ---- remote delegation ([CAP-DEC-05]); in development the API is mocked from srv/external/data
    const bp = await cds.connect.to('API_BUSINESS_PARTNER');
    this.on('READ', RemoteSuppliers, async (req) => {
      try {
        return await bp.run(req.query);
      } catch (err) {
        LOG.error('Business Partner API call failed', err);
        return req.reject({ status: 502, message: 'REMOTE_UNAVAILABLE' });
      }
    });

    return super.init();
  }

  /**
   * Executes one status action on an active order: checks the transition and the action-specific
   * rules, updates the status, writes the approval log and emits POApproved.
   * @param {string} action
   * @param {import('@sap/cds').Request} req
   */
  async changeStatus(action, req) {
    const { PurchaseOrders, PurchaseOrderItems, ApprovalLog } = this.entities;
    const { ID } = req.params[0];
    const po = await SELECT.one.from(PurchaseOrders).columns('ID', 'orderNo', 'status', 'createdBy').where({ ID });
    if (!po) return req.reject({ status: 404, message: 'ORDER_NOT_FOUND', args: [ID] });
    const target = nextStatus(action, po.status);
    if (!target) return req.reject({ status: 409, message: 'INVALID_STATE', args: [po.orderNo, po.status, action] });

    if (action === 'submit') {
      const { n } = await SELECT.one.from(PurchaseOrderItems).columns('count(1) as n').where({ parent_ID: ID });
      if (!n) return req.reject({ status: 400, message: 'PO_NO_ITEMS', args: [po.orderNo] });
    }
    if (action === 'approve' && po.createdBy === req.user.id) {
      return req.reject({ status: 403, message: 'APPROVER_IS_REQUESTER', args: [po.orderNo] });
    }
    if (action === 'reject' && !req.data.comment?.trim()) {
      return req.reject({ status: 400, message: 'REJECT_COMMENT_REQUIRED', target: 'comment' });
    }

    await UPDATE(PurchaseOrders).set({ status: target }).where({ ID });
    if (action === 'approve' || action === 'reject') {
      await INSERT.into(ApprovalLog).entries({ po_ID: ID, approver: req.user.id, decision: target, comment: req.data.comment });
    }
    if (action === 'approve') await this.emit('POApproved', { ID, orderNo: po.orderNo, approver: req.user.id });

    return this.run(SELECT.one.from(PurchaseOrders).where({ ID, IsActiveEntity: true }));
  }
};
