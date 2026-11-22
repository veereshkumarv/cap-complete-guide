/**
 * What: Stage 08 additions to the domain model: the S/4HANA Business Partner link of suppliers
 *     (replicated fields), file attachments on purchase orders, and the notifications written by the
 *     consumer of the "order approved" message.
 * Why: [CAP-M08] [CAP-M15] [CAP-M18] / [CAP-DEC-05] - replicated supplier data allows local joins
 *     and validation (blocked suppliers); attachments use the @cap-js/attachments aspect; the
 *     notifications table makes the message consumer idempotent and observable.
 * If missing or unlinked: Replication has nowhere to store the BP number, the Attachments section is
 *     missing from the object page, and approved-order messages have no consumer.
 */
using { acme.procurement as my } from './schema';
using { Attachments } from '@cap-js/attachments';
using { cuid, managed } from '@sap/cds/common';

namespace acme.procurement;

extend my.Suppliers with {
  /** S/4HANA business partner number - the key for replication. */
  bpNumber      : String(10) @readonly;
  /** Central block from S/4HANA: no new orders for blocked suppliers. */
  blocked       : Boolean default false @readonly;
  /** LastChangeDate of the business partner when it was last replicated (stale-event check). */
  bpLastChanged : Date @readonly;
}

// Two concurrent "created" events for the same partner: the second insert fails and is retried
// by the outbox, then finds the row and does nothing.
annotate my.Suppliers with @assert.unique: { bpNumber: [bpNumber] };

extend my.PurchaseOrders with {
  /** Quotes, contracts, delivery notes - stored by the attachments plugin (DB in dev, object store in prod). */
  attachments : Composition of many Attachments;
}

// Upload limits (security review): the plugin defaults are 400 MB and any MIME type, which allows
// HTML/script files that a browser might render. Only business document types, at most 10 MB.
annotate my.PurchaseOrders.attachments with {
  content @Validation.Maximum: '10MB'
          @Core.AcceptableMediaTypes: [
            'application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ];
};

/** Written once per approved order by the message consumer (idempotent by key). */
entity Notifications : managed {
  key ID        : String(60); // <order ID>:<event> - a redelivered message hits the same key
      po        : Association to my.PurchaseOrders;
      orderNo   : String(20);
      recipient : String(30);
      message   : String(255);
}
