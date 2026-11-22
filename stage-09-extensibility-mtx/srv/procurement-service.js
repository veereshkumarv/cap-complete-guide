/**
 * What: Implementation of ProcurementService: order numbers and defaults for new drafts, price
 *     defaulting and validation of items, live and final order totals, the five status actions with
 *     approval log and four-eyes rule, the topSuppliers function, the POApproved event and the
 *     delegation of RemoteSuppliers to the S/4HANA Business Partner API, and the UI hints
 *     statusCriticality (status colour) and canEdit (Edit/Delete buttons per user) for the Fiori app;
 *     stage 08: drafts-only creation, blocked-supplier check and the outboxed approval message.
 * Why: [CAP-M05] [CAP-M06] [CAP-M07] [CAP-M08] - rules that annotations cannot express live here
 *     (CAP-DEC-02); every message is an i18n key from _i18n/messages*.properties.
 * If missing or unlinked: CAP serves the generic CRUD only - orders get no number or total, actions
 *     answer 501 "not implemented" and RemoteSuppliers returns nothing.
 */
const cds = require('@sap/cds');
const { nextStatus, criticality } = require('./lib/status');
const { canEdit } = require('./lib/permissions');
const { assertProductionAuth } = require('./lib/startup-guard');
const { ORDER_APPROVED } = require('./integration/approval-notifications');
const { nextNumber } = require('./lib/number-range');
const { sumItems, recalculate } = require('./lib/totals');

const LOG = cds.log('procurement');

/**
 * Maps a failed remote call to a client error without leaking remote details: a bad query stays a
 * 400, a denied principal a 403, a timeout a 504, everything else 502 (S/4 review M3).
 * @param {any} err
 */
function remoteError(err) {
  const status = err.reason?.response?.status ?? err.response?.status ?? err.statusCode ?? err.status;
  LOG.error('Business Partner API call failed', { status, code: err.code }); // no URL - it contains filter values
  if (status === 400) return { status: 400, message: 'REMOTE_QUERY_NOT_SUPPORTED', args: ['query'] };
  if (status === 401 || status === 403) return { status: 403, message: 'REMOTE_FORBIDDEN' };
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message)) return { status: 504, message: 'REMOTE_TIMEOUT' };
  return { status: 502, message: 'REMOTE_UNAVAILABLE' };
}

module.exports = class ProcurementService extends cds.ApplicationService {
  async init() {
    assertProductionAuth(process.env, cds.env.requires.auth); // never serve with mocked users on CF
    const { PurchaseOrders, PurchaseOrderItems, Products, RemoteSuppliers } = this.entities;
    const messaging = await cds.connect.to('messaging'); // queued: emits are stored in the outbox ([CAP-M18])
    this.messaging = messaging;

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

    // ---- orders are born as drafts (number range, defaults, validation). A direct create of an
    // active order (POST with IsActiveEntity: true) would skip all of that - and crashes the
    // @cap-js/attachments 4.0 SAVE handler, which expects the draft key in req.subject.
    this.before('CREATE', PurchaseOrders, (req) => {
      const fromDraft = !!req.subject?.ref?.[0]?.where; // draftActivate addresses the draft by key
      if (!fromDraft) return req.reject({ status: 400, message: 'ORDER_DRAFT_ONLY' });
    });

    // ---- items of active orders change only through a draft (security review: a requester could
    // DELETE an item of an approved order and leave a total that no longer matches the items)
    this.before('DELETE', PurchaseOrderItems, (req) => req.reject({ status: 409, message: 'ORDER_NOT_EDITABLE' }));

    // ---- attachments: frozen once the order left status Draft (the attachments plugin accepts
    // writes on the active entity, so @restrict alone cannot express the status condition)
    const attachments = this.entities['PurchaseOrders.attachments'];
    this.before(['CREATE', 'UPDATE', 'DELETE'], attachments, async (req) => {
      const ID = req.data.up__ID ?? req.params?.[0]?.ID ?? req.params?.[0];
      const po = await SELECT.one.from(PurchaseOrders).columns('status').where({ ID });
      if (po && po.status !== 'Draft') return req.reject({ status: 409, message: 'ORDER_NOT_EDITABLE' });
    });

    // ---- no new or changed orders for suppliers blocked in S/4HANA (replicated, stage 08)
    this.before(['NEW', 'UPDATE'], PurchaseOrders.drafts, (req) => this.assertSupplierNotBlocked(req));
    this.before(['CREATE', 'UPDATE'], PurchaseOrders, (req) => this.assertSupplierNotBlocked(req));

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
      // grouped by supplier ID (names are not unique) and currency (never add EUR to USD)
      return SELECT.from(PurchaseOrders)
        .columns('supplier.ID as supplierID', 'supplier.name as supplier', 'currency.code as currency', 'sum(totalAmount) as total', 'count(1) as orders')
        .where({ status: { in: ['Approved', 'SentToSupplier'] } })
        .groupBy('supplier.ID', 'supplier.name', 'currency.code')
        .orderBy('total desc')
        .limit(limit);
    });

    // ---- in-process event consumer ([CAP-DEC-04]); stage 08 moves delivery to an outbox
    this.on('POApproved', (msg) => {
      LOG.info('purchase order approved', { orderNo: msg.data.orderNo }); // no user IDs in logs (privacy)
    });

    // ---- remote delegation ([CAP-DEC-05]); in development the API is mocked from srv/external/data
    const bp = await cds.connect.to('API_BUSINESS_PARTNER');
    // Guard the remote system: no free-text search, no deep paging, sorting only on indexed fields
    // (every query option is passed through to S/4HANA - S/4 review M4).
    this.before('READ', RemoteSuppliers, (req) => {
      const q = req.query.SELECT;
      if (q.search) return req.reject({ status: 400, message: 'REMOTE_QUERY_NOT_SUPPORTED', args: ['$search'] });
      if ((q.limit?.offset?.val ?? 0) > 1000) return req.reject({ status: 400, message: 'REMOTE_QUERY_NOT_SUPPORTED', args: ['$skip > 1000'] });
      if (q.orderBy?.some((o) => !['ID', 'name'].includes(o.ref?.[0]))) {
        return req.reject({ status: 400, message: 'REMOTE_QUERY_NOT_SUPPORTED', args: ['$orderby'] });
      }
    });
    this.on('READ', RemoteSuppliers, async (req) => {
      try {
        return await bp.run(req.query);
      } catch (err) {
        return req.reject(remoteError(err));
      }
    });

    return super.init();
  }

  /**
   * Rejects the request when the order's supplier is blocked in S/4HANA.
   * @param {import('@sap/cds').Request} req
   */
  async assertSupplierNotBlocked(req, supplier_ID = req.data.supplier_ID) {
    if (!supplier_ID) return;
    const { Suppliers } = this.entities;
    const supplier = await SELECT.one.from(Suppliers).columns('name', 'blocked').where({ ID: supplier_ID });
    if (supplier?.blocked) req.reject({ status: 400, message: 'SUPPLIER_BLOCKED', args: [supplier.name], target: 'supplier_ID' });
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
    const po = await SELECT.one.from(PurchaseOrders).columns('ID', 'orderNo', 'status', 'createdBy', 'supplier_ID').where({ ID });
    if (!po) return req.reject({ status: 404, message: 'ORDER_NOT_FOUND', args: [ID] });
    const target = nextStatus(action, po.status);
    if (!target) return req.reject({ status: 409, message: 'INVALID_STATE', args: [po.orderNo, po.status, action] });

    // An open edit draft would overwrite the new status when it is saved (correctness review F1).
    if (await SELECT.one.from(PurchaseOrders.drafts).columns('ID').where({ ID })) {
      return req.reject({ status: 409, message: 'ORDER_BEING_EDITED', args: [po.orderNo] });
    }
    if (action === 'submit') {
      const { n, missing } = await SELECT.one.from(PurchaseOrderItems)
        .columns('count(1) as n', 'sum(case when quantity is null or quantity < 1 then 1 else 0 end) as missing')
        .where({ parent_ID: ID });
      if (!n) return req.reject({ status: 400, message: 'PO_NO_ITEMS', args: [po.orderNo] });
      if (missing) return req.reject({ status: 400, message: 'ITEM_QUANTITY_MISSING', args: [po.orderNo] });
    }
    if (['submit', 'approve', 'send'].includes(action)) await this.assertSupplierNotBlocked(req, po.supplier_ID);
    // four-eyes principle: nobody decides about their own order
    if ((action === 'approve' || action === 'reject') && po.createdBy === req.user.id) {
      return req.reject({ status: 403, message: 'APPROVER_IS_REQUESTER', args: [po.orderNo] });
    }
    if (action === 'reject' && !req.data.comment?.trim()) {
      return req.reject({ status: 400, message: 'REJECT_COMMENT_REQUIRED', target: 'comment' });
    }

    // Conditional update: if a concurrent request changed the status since our read, nothing is
    // updated and this request fails instead of both "winning" (correctness review F2).
    const changed = await UPDATE(PurchaseOrders).set({ status: target }).where({ ID, status: po.status });
    if (!changed) return req.reject({ status: 409, message: 'INVALID_STATE', args: [po.orderNo, '?', action] });
    if (action === 'approve' || action === 'reject') {
      await INSERT.into(ApprovalLog).entries({ po_ID: ID, approver: req.user.id, decision: target, comment: req.data.comment });
    }
    if (action === 'approve') {
      const event = { ID, orderNo: po.orderNo, approver: req.user.id };
      await this.emit('POApproved', event); // in-process (stage 04)
      // Stored in cds.outbox.Messages in this transaction, delivered after commit - or never, on rollback.
      await this.messaging.emit(ORDER_APPROVED, event);
    }

    return this.run(SELECT.one.from(PurchaseOrders).where({ ID, IsActiveEntity: true }));
  }
};
