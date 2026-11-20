/**
 * What: Domain of the outbox sample: orders (confirmed by an action), invoices written by the
 *     message consumer, and shipment bookings written by the queued ShippingService.
 * Why: [CAP-M07] [CAP-M18] the consumer and the queued call each write one row per order - keys
 *     derived from the order make them idempotent and make delivery visible in tests.
 * If missing or unlinked: The services have no tables; neither the action nor the consumers work.
 */
using { cuid, managed } from '@sap/cds/common';

namespace sample.outbox;

entity Orders : cuid, managed {
  customer : String(100);
  amount   : Decimal(11, 2);
  status   : String(20) enum { New; Confirmed; } default 'New';
}

/** One invoice per confirmed order - written by the consumer of OrderConfirmed. */
entity Invoices : managed {
  key order  : Association to Orders; // the key: a redelivered message finds the existing invoice
      amount : Decimal(11, 2);
}

/** One booking per order - written by ShippingService.book (called through the outbox). */
entity ShipmentBookings : managed {
  key order : Association to Orders;
}
