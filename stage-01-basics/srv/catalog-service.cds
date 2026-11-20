/**
 * What: CatalogService - exposes Products read-only over OData V4 at /odata/v4/catalog.
 * Why: [CAP-M01] shows that a service is a projection on the domain model; @readonly keeps this
 *     first service free of write logic.
 * If missing or unlinked: cds watch serves no endpoint ("No service definitions found") and the
 *     smoke test fails.
 */
using { acme.procurement as db } from '../db/schema';

service CatalogService @(path: '/odata/v4/catalog') {
  @readonly entity Products as projection on db.Products;
}
