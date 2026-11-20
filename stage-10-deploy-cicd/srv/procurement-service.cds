/**
 * What: ProcurementService - requester API with draft-enabled purchase orders, the PO status
 *     actions (submit/approve/reject/send/reopen), the topSuppliers function, the POApproved event,
 *     RemoteSuppliers delegated to the S/4HANA Business Partner API, and the virtual
 *     elements statusCriticality (status colour) and canEdit (per-user Edit/Delete buttons) used by
 *     the Fiori app.
 * Why: [CAP-M03] [CAP-M06] [CAP-M07] [CAP-M08] [CAP-M09] - actions are the contract for the workflow (never a
 *     raw PATCH of status), functions are side-effect free reads, events decouple follow-up work.
 * If missing or unlinked: No API exists for orders or their lifecycle; srv/procurement-service.js
 *     has no service to implement and the Fiori app of stage 05 has nothing to call.
 */
using { acme.procurement as db } from '../db/schema';
using from '../db/extensions'; // stage 08: bpNumber/blocked, attachments, Notifications
using { API_BUSINESS_PARTNER as bp } from './external/API_BUSINESS_PARTNER';

service ProcurementService @(path: '/odata/v4/procurement') {
  @odata.draft.enabled
  entity PurchaseOrders     as projection on db.PurchaseOrders {
    *,
    // UI colour of the status (0 neutral, 1 red, 2 orange, 3 green) - filled in an after-READ handler.
    virtual null as statusCriticality : Integer,
    // UI hint: may the current user edit/delete this order? Mirrors srv/authorizations.cds (stage 06).
    virtual null as canEdit           : Boolean
  } actions {
    /** Draft -> Submitted. */
    action submit()                 returns PurchaseOrders;
    /** Submitted -> Approved; writes the approval log, emits POApproved and publishes the
     *  acme.procurement.PurchaseOrder.Approved.v1 message (outbox). */
    action approve(comment: String) returns PurchaseOrders;
    /** Submitted -> Rejected; comment is mandatory. */
    action reject(comment: String)  returns PurchaseOrders;
    /** Approved -> SentToSupplier. */
    action send()                   returns PurchaseOrders;
    /** Rejected -> Draft, so the requester can correct and resubmit. */
    action reopen()                 returns PurchaseOrders;
  };
  entity PurchaseOrderItems as projection on db.PurchaseOrderItems;

  @readonly entity Products    as projection on db.Products;
  @readonly entity Categories  as projection on db.Categories;
  @readonly entity Suppliers   as projection on db.Suppliers { ID, name, country, blocked };
  @readonly entity ApprovalLog as projection on db.ApprovalLog;
  /** Written by the consumer of the order-approved message (stage 08). */
  @readonly entity Notifications as projection on db.Notifications;

  /** Live view on S/4HANA business partners - delegated per request, never stored ([CAP-DEC-05]). */
  @readonly entity RemoteSuppliers as projection on bp.A_BusinessPartner {
    key BusinessPartner          as ID,
        BusinessPartnerFullName  as name,
        Industry                 as industry,
        BusinessPartnerIsBlocked as blocked,
        LastChangeDate           as lastChanged
  };

  /** Suppliers ranked by approved and sent order value (read-only computation). */
  function topSuppliers(limit: Integer) returns array of {
    supplier : String;
    total    : Decimal(15, 2);
    orders   : Integer;
  };

  /** Raised after an order was approved - consumers react without coupling to this service. */
  event POApproved {
    ID       : UUID;
    orderNo  : String;
    approver : String;
  }
}
