/**
 * What: Consumer of the "purchase order approved" message: writes one notification for the buyers
 *     ("send PO-... to the supplier").
 * Why: [CAP-M07] [CAP-M18] the message is delivered from the outbox at least once, so the consumer
 *     must be idempotent - the notification key is derived from the order, a redelivery finds the
 *     existing row and does nothing. It also does not trust the payload: the order must really be
 *     approved in the database (a forged message cannot create a "send to supplier" task).
 * If missing or unlinked: Approved orders produce no notification, and a redelivered message would
 *     create duplicates if the key were random.
 */
const cds = require('@sap/cds');

const LOG = cds.log('notifications');

/** Topic of the message published by ProcurementService when an order is approved. */
const ORDER_APPROVED = 'acme.procurement.PurchaseOrder.Approved.v1';

/**
 * @param {{ data: { ID: string, orderNo: string, approver: string } }} msg
 * @returns {Promise<'created'|'duplicate'|'ignored'>}
 */
async function onOrderApproved(msg) {
  const { Notifications, PurchaseOrders } = cds.entities('acme.procurement');
  const po_ID = msg.data?.ID;
  const po = po_ID && await SELECT.one.from(PurchaseOrders).columns('orderNo', 'status').where({ ID: po_ID });
  if (!po || !['Approved', 'SentToSupplier'].includes(po.status)) {
    LOG.warn('approval message ignored - order not approved', { po_ID });
    return 'ignored';
  }
  const { orderNo } = po;
  const ID = `${po_ID}:approved`;
  if (await SELECT.one.from(Notifications).columns('ID').where({ ID })) {
    LOG.info('duplicate message ignored', { orderNo });
    return 'duplicate';
  }
  await INSERT.into(Notifications).entries({
    ID, po_ID, orderNo, recipient: 'Buyer',
    message: `Purchase order ${orderNo} was approved - send it to the supplier.`, // no user IDs (privacy)
  });
  return 'created';
}

module.exports = { ORDER_APPROVED, onOrderApproved };
