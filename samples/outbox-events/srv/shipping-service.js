/**
 * What: Implementation of ShippingService.book: records one shipment booking per order; an unknown
 *     order is an unrecoverable error (no retry, the message becomes a dead letter).
 * Why: [CAP-M18] demonstrates both outcomes of queued calls - transient errors are retried with
 *     exponential backoff, unrecoverable ones stop immediately instead of retrying for an hour.
 * If missing or unlinked: queued bookings fail with 501 on every attempt and pile up in the outbox.
 */
const cds = require('@sap/cds');

module.exports = class ShippingService extends cds.ApplicationService {
  init() {
    this.on('book', async (req) => {
      const { Orders, ShipmentBookings } = cds.entities('sample.outbox');
      const order_ID = req.data.order;
      if (!(await SELECT.one.from(Orders).columns('ID').where({ ID: order_ID }))) {
        // retrying will never help - mark it so the outbox stops (dead letter)
        throw Object.assign(new Error(`Unknown order ${order_ID}`), { unrecoverable: true });
      }
      if (await SELECT.one.from(ShipmentBookings).where({ order_ID })) return; // already booked
      await INSERT.into(ShipmentBookings).entries({ order_ID });
    });
    return super.init();
  }
};
