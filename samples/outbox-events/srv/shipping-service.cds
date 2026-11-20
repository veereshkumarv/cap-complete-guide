/**
 * What: ShippingService - stands in for a remote carrier API (internal, no HTTP endpoint) with one
 *     action that books a shipment for an order.
 * Why: [CAP-M18] shows `cds.queued(srv)`: calls to an unreliable system are stored in the outbox
 *     and retried with backoff instead of failing the user's request.
 * If missing or unlinked: OrderService.confirm cannot queue the booking and fails.
 */
@protocol: 'none'
service ShippingService {
  /** Books a shipment; idempotent per order. */
  action book(order : UUID);
}
