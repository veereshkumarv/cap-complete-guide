/**
 * What: Implementation of OrderService: the confirm action (status change + OrderConfirmed message
 *     + queued shipment booking in one transaction) and the idempotent consumer of OrderConfirmed
 *     that writes the invoice.
 * Why: [CAP-M07] [CAP-M18] / [CAP-DEC-04] the messaging service is queued (package.json) and the
 *     shipping service is wrapped with cds.queued(): both are stored in cds.outbox.Messages inside
 *     the action's transaction and delivered after commit, with retries (at least once).
 * If missing or unlinked: confirm answers 501, no message is sent and no invoice is created.
 */
const cds = require('@sap/cds');

const ORDER_CONFIRMED = 'OrderService.OrderConfirmed';

module.exports = class OrderService extends cds.ApplicationService {
  async init() {
    const { Orders } = this.entities;
    const messaging = await cds.connect.to('messaging'); // queued by configuration
    const shipping = cds.queued(await cds.connect.to('ShippingService')); // queued explicitly

    this.on('confirm', Orders, async (req) => {
      const { ID } = req.params[0];
      const order = await SELECT.one.from(Orders).columns('status', 'amount').where({ ID });
      if (!order) return req.reject(404, `Order ${ID} does not exist.`);
      if (order.status !== 'New') return req.reject(409, `Order is already ${order.status}.`);

      // conditional update: two concurrent confirms must not both emit (one message per order)
      const changed = await UPDATE(Orders).set({ status: 'Confirmed' }).where({ ID, status: 'New' });
      if (!changed) return req.reject(409, 'Order was confirmed concurrently.');
      await messaging.emit(ORDER_CONFIRMED, { order: ID, amount: order.amount }); // -> outbox
      await shipping.send('book', { order: ID }); // -> outbox, retried if the carrier is down
      return SELECT.one.from(Orders, ID);
    });

    // Consumer - in a real landscape another app (invoicing) subscribed via Event Mesh.
    // Delivery is at least once: the invoice key is the order, so a redelivery changes nothing.
    messaging.on(ORDER_CONFIRMED, async (msg) => {
      const { Invoices } = cds.entities('sample.outbox');
      if (await SELECT.one.from(Invoices).where({ order_ID: msg.data.order })) return; // duplicate
      await INSERT.into(Invoices).entries({ order_ID: msg.data.order, amount: msg.data.amount });
    });

    return super.init();
  }
};
