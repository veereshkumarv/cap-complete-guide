/**
 * What: AdminService - master-data maintenance at /odata/v4/admin: suppliers (with contacts),
 *     products and categories, without draft.
 * Why: [CAP-M03] / [CAP-DEC-01] buyers and admins maintain master data through a separate service
 *     with its own (later stricter) authorization; simple records do not need draft overhead.
 * If missing or unlinked: Master data can only change via CSV files; there is no API for buyers.
 */
using { acme.procurement as db } from '../db/schema';

service AdminService @(path: '/odata/v4/admin') {
  entity Suppliers  as projection on db.Suppliers;
  entity Products   as projection on db.Products;
  entity Categories as projection on db.Categories;
}
