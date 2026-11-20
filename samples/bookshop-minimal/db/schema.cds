/**
 * What: Domain model of the minimal bookshop: authors and their books.
 * Why: [CAP-M02] one association in each direction (book -> author, author -> books) is the
 *     smallest model that still shows navigation, $expand and managed keys.
 * If missing or unlinked: The services have nothing to project and the CSV files cannot be loaded.
 */
using { cuid, managed } from '@sap/cds/common';

namespace sample.bookshop;

entity Authors : cuid, managed {
  name  : String(100) @mandatory;
  books : Association to many Books on books.author = $self;
}

entity Books : cuid, managed {
  title  : String(150) @mandatory;
  author : Association to Authors @mandatory;
  stock  : Integer @assert.range: [0, 99999];
  price  : Decimal(9, 2);
}
