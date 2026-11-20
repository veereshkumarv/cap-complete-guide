/**
 * What: Complete ACME Procurement domain model: suppliers with contacts, product categories (code
 *     list), localized products, purchase orders with items, PO status enum and the approval log.
 * Why: [CAP-M02] / [CAP-STAGE-02] - the model drives the database schema, OData metadata and UI of
 *     all later stages; it demonstrates composition vs. association, enums, code lists, localized
 *     and calculated elements in one realistic domain.
 * If missing or unlinked: Every service projection fails to compile ("No such definition
 *     acme.procurement..."), no tables are deployed and all later stages lose their foundation.
 */
using { cuid, managed, sap.common.CodeList, Currency, Country } from '@sap/cds/common';

namespace acme.procurement;

/** Companies ACME buys from. Contacts live and die with the supplier -> Composition. */
entity Suppliers : cuid, managed {
  name     : String(100) @mandatory;
  country  : Country;
  rating   : Integer @assert.range: [1, 5];
  contacts : Composition of many SupplierContacts on contacts.supplier = $self;
  orders   : Association to many PurchaseOrders on orders.supplier = $self;
}

/** Contact persons of a supplier (personal data - annotated for privacy in stage 08). */
entity SupplierContacts : cuid {
  supplier : Association to Suppliers;
  name     : String(100);
  email    : String(255);
  phone    : String(30);
}

/** Code list: `CodeList` adds localized name and descr; the key is a readable code. */
entity Categories : CodeList {
  key code : String(20);
}

/** Goods ACME buys. `localized` creates a texts table per language. */
entity Products : cuid, managed {
  name     : localized String(100) @mandatory;
  descr    : localized String(500);
  category : Association to Categories;
  price    : Decimal(11, 2);
  currency : Currency;
  stock    : Integer;
}

/** Lifecycle of a purchase order (see the state diagram in the README). */
type POStatus : String(20) enum {
  Draft;
  Submitted;
  Approved;
  Rejected;
  SentToSupplier;
}

/** Purchase order. Items are owned by the order -> Composition (deleted and drafted together). */
entity PurchaseOrders : cuid, managed {
  orderNo     : String(20) @readonly;
  supplier    : Association to Suppliers @mandatory;
  status      : POStatus default 'Draft' @readonly;
  totalAmount : Decimal(15, 2) @readonly;
  currency    : Currency;
  items       : Composition of many PurchaseOrderItems on items.parent = $self;
  // The audit trail must survive changes to the order -> Association, not Composition.
  approvals   : Association to many ApprovalLog on approvals.po = $self;
}

entity PurchaseOrderItems : cuid {
  parent     : Association to PurchaseOrders;
  product    : Association to Products @mandatory;
  quantity   : Integer @assert.range: [1, 9999];
  netPrice   : Decimal(11, 2);
  // Calculated element (on read): never stored, always consistent with quantity and price.
  itemAmount : Decimal(15, 2) = quantity * netPrice;
}

/** Decision taken on a purchase order; written by actions (stage 04), never edited. */
entity ApprovalLog : cuid, managed {
  po       : Association to PurchaseOrders;
  approver : String(255);
  decision : String(20) enum { Approved; Rejected; };
  comment  : String(1000);
}
