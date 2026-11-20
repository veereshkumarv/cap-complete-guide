/**
 * What: Change tracking of purchase orders and their items with @cap-js/change-tracking: which
 *     elements are logged and how changed objects and values are labelled in the Change History.
 * Why: [CAP-M16] audit trail for compliance - who changed which field from what to what, also for
 *     status changes made by actions; v2 of the plugin generates database triggers, so every write
 *     (OData, handlers, cds.db) is captured.
 * If missing or unlinked: Changes are not recorded and the object page has no Change History
 *     section.
 */
using { acme.procurement as my } from './schema';

// Object ID shown in the history: the order number instead of the UUID.
annotate my.PurchaseOrders with @changelog: [orderNo] {
  supplier    @changelog: [supplier.name];
  status      @changelog;
  totalAmount @changelog;
  currency    @changelog;
};

// Items are identified by their product name; changes link to the parent order's history.
annotate my.PurchaseOrderItems with @changelog: [product.name] {
  product  @changelog: [product.name];
  quantity @changelog;
  netPrice @changelog;
};

// Labels for the Change History table (object type and field): the plugin reads @title of the
// database entities and elements, not of the service projections.
annotate my.PurchaseOrders with @title: '{i18n>PurchaseOrder}' {
  supplier    @title: '{i18n>Supplier}';
  status      @title: '{i18n>Status}';
  totalAmount @title: '{i18n>TotalAmount}';
  currency    @title: '{i18n>Currency}';
};
annotate my.PurchaseOrderItems with @title: '{i18n>PurchaseOrderItem}' {
  product  @title: '{i18n>Product}';
  quantity @title: '{i18n>Quantity}';
  netPrice @title: '{i18n>NetPrice}';
};
