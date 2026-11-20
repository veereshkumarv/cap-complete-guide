/**
 * What: CatalogService - read-only OData V4 view on products and their categories at
 *     /odata/v4/catalog (unchanged purpose from stage 01, now on the full domain model).
 * Why: [CAP-STAGE-02] keeps the model observable over HTTP - localized product names and the
 *     category code list can be checked in the browser in English and German.
 * If missing or unlinked: The domain model still deploys, but nothing is served over HTTP and the
 *     localization tests fail.
 */
using { acme.procurement as db } from '../db/schema';

service CatalogService @(path: '/odata/v4/catalog') {
  @readonly entity Products   as projection on db.Products;
  @readonly entity Categories as projection on db.Categories;
}
