/**
 * What: ProcurementService - the requester-facing API at /odata/v4/procurement: draft-enabled
 *     purchase orders with items, read-only products, suppliers, categories and approval log.
 * Why: [CAP-M03] / [CAP-DEC-01] one service per use case; projections expose only what requesters
 *     need, and @odata.draft.enabled gives Fiori-style draft editing of an order and its items.
 * If missing or unlinked: There is no API to create or read purchase orders; the Fiori app
 *     (stage 05) and all handler logic (stage 04) have nothing to attach to.
 */
using { acme.procurement as db } from '../db/schema';

service ProcurementService @(path: '/odata/v4/procurement') {
  @odata.draft.enabled
  entity PurchaseOrders     as projection on db.PurchaseOrders;
  entity PurchaseOrderItems as projection on db.PurchaseOrderItems;

  @readonly entity Products    as projection on db.Products;
  @readonly entity Categories  as projection on db.Categories;
  // Only the fields a requester needs - contacts (personal data) are not exposed here.
  @readonly entity Suppliers   as projection on db.Suppliers { ID, name, country };
  @readonly entity ApprovalLog as projection on db.ApprovalLog;
}
