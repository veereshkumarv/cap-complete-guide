/**
 * What: Query behaviour of the services: which elements the free-text $search looks at
 *     (@cds.search) and the default / maximum page size of every entity set (@cds.query.limit).
 * Why: [CAP-M13] / [CAP-STAGE-07] - without @cds.search CAP searches every String element (slow on
 *     big tables, including technical fields); without a limit one request can read a whole table.
 * If missing or unlinked: The Fiori search field scans all text columns, and $top=1000000 or a
 *     missing $top returns as many rows as CAP's global default allows.
 */
using { ProcurementService } from './procurement-service';
using { AdminService } from './admin-service';

// Page sizes: Fiori asks for ~30 rows per page; protect the database from unbounded reads.
annotate ProcurementService with @cds.query.limit: { default: 50, max: 200 };
annotate AdminService       with @cds.query.limit: { default: 50, max: 200 };

// Search the order number and the supplier's name - not UUIDs, currency codes or user IDs.
annotate ProcurementService.PurchaseOrders with @cds.search: { orderNo, supplier };
annotate ProcurementService.Suppliers      with @cds.search: { name };
annotate ProcurementService.Products       with @cds.search: { name, descr };
annotate AdminService.Suppliers            with @cds.search: { name };
annotate AdminService.Products             with @cds.search: { name, descr };
