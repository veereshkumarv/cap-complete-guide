/**
 * What: Domain model of stage 01 - a single Products entity in the acme.procurement namespace.
 * Why: [CAP-M01] the smallest useful model: one entity is enough to see CAP derive a database
 *     table, an OData entity set and CSV-based initial data from CDS.
 * If missing or unlinked: The service has nothing to project on (cds compile fails with
 *     "No such definition acme.procurement.Products") and no table is created.
 */
using { cuid } from '@sap/cds/common';

namespace acme.procurement;

/** Goods ACME buys. `cuid` adds a generated UUID key named ID. */
entity Products : cuid {
  name     : String(100) @mandatory;
  descr    : String(500);
  price    : Decimal(11, 2);
  currency : String(3);
  stock    : Integer;
}
