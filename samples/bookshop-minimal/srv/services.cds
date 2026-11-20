/**
 * What: The two services of the bookshop: a read-only CatalogService for readers and an
 *     AdminService for maintaining authors and books.
 * Why: [CAP-M03] / [CAP-DEC-01] one service per use case - readers see a reduced, read-only view,
 *     administrators get full CRUD.
 * If missing or unlinked: cds watch serves no endpoints; the model is deployed but unreachable.
 */
using { sample.bookshop as db } from '../db/schema';

service CatalogService @(path: '/odata/v4/catalog') {
  @readonly entity Books   as projection on db.Books { ID, title, author, price, stock };
  @readonly entity Authors as projection on db.Authors { ID, name, books };
}

service AdminService @(path: '/odata/v4/admin') {
  entity Books   as projection on db.Books;
  entity Authors as projection on db.Authors;
}
