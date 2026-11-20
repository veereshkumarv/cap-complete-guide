/**
 * What: OrderService - orders with the confirm action (publishes OrderConfirmed and books a
 *     shipment, both through the outbox) plus read-only invoices and bookings to observe delivery.
 * Why: [CAP-M07] [CAP-M18] the action is the transaction boundary: business data, message and
 *     queued call commit together or not at all.
 * If missing or unlinked: The sample has no API; srv/order-service.js has nothing to implement.
 */
using { sample.outbox as db } from '../db/schema';

service OrderService @(path: '/odata/v4/orders') {
  entity Orders as projection on db.Orders actions {
    /** New -> Confirmed; emits OrderConfirmed and queues a shipment booking. */
    action confirm() returns Orders;
  };
  @readonly entity Invoices         as projection on db.Invoices;
  @readonly entity ShipmentBookings as projection on db.ShipmentBookings;

  /** Published via the queued messaging service (topic OrderService.OrderConfirmed). */
  event OrderConfirmed {
    order  : UUID;
    amount : Decimal(11, 2);
  }
}
