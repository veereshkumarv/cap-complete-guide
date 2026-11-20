/**
 * What: Tenant extension of ACME Procurement: a delivery note on purchase orders, shown in the
 *     General section of the object page.
 * Why: [CAP-M21] example of a customer-specific field - it exists only in the tenant the extension
 *     is pushed to. Field names must start with x_ and only allowlisted entities may be extended
 *     (rules in ../mtx/sidecar/package.json).
 * If missing or unlinked: `cds push` uploads an empty extension and the field does not appear.
 */
using from 'procurement-stage-10'; // the base model pulled into .base by `cds pull`

extend acme.procurement.PurchaseOrders with {
  x_deliveryNote : String(255) @title: 'Delivery Note';
};

annotate ProcurementService.PurchaseOrders with @UI.FieldGroup #General: {
  Data: [ ..., { Value: x_deliveryNote } ]
};
