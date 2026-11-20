/**
 * What: Consumer of the "purchase order approved" message: writes one notification for the buyers
 *     ("send PO-... to the supplier").
 * Why: [CAP-M07] [CAP-M18] the message is delivered from the outbox at least once, so the consumer
 *     must be idempotent - the notification key is derived from the order, a redelivery finds the
 *     existing row and does nothing.
 * If missing or unlinked: Approved orders produce no notification, and a redelivered message would
 *     create duplicates if the key were random.
 */
const cds = require('@sap/cds');

const LOG = cds.log('notifications');

/** Topic of the message published by ProcurementService when an order is approved. */
const ORDER_APPROVED = 'acme.procurement.PurchaseOrder.Approved.v1';

/**
 * @param {{ data: { ID: string, orderNo: string, approver: string } }} msg
 * @returns {Promise<'created'|'duplicate'>}
 */
async function onOrderApproved(msg) {
  const { Notifications } = cds.entities('acme.procurement');
  const { ID: po_ID, orderNo, approver } = msg.data;
  const ID = `${po_ID}:approved`;
  if (await SELECT.one.from(Notifications).columns('ID').where({ ID })) {
    LOG.info('duplicate message ignored', { orderNo });
    return 'duplicate';
  }
  await INSERT.into(Notifications).entries({
    ID, po_ID, orderNo, recipient: 'Buyer',
    message: `Purchase order ${orderNo} was approved by ${approver} - send it to the supplier.`,
  });
  return 'created';
}

module.exports = { ORDER_APPROVED, onOrderApproved };
