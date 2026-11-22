/**
 * What: Authorization model of ACME Procurement: who may call which service, entity, action and
 *     function - five roles (Requester, Approver, Buyer, Admin, Auditor) with instance-based
 *     restrictions so requesters see and change only their own purchase orders.
 * Why: [CAP-M11] / [CAP-STAGE-06] / role table [CAP-S02] 2.5 - declarative @requires/@restrict are
 *     enforced by the CAP runtime for every protocol (OData, REST, internal service calls) and are
 *     the input for `cds add xsuaa` (scopes and role templates in xs-security.json).
 * If missing or unlinked: Every authenticated (in development even anonymous) user can read, change,
 *     approve and send every order and maintain all master data.
 */
using { ProcurementService } from './procurement-service';
using { AdminService } from './admin-service';

// ------------------------------------------------------------------ ProcurementService
annotate ProcurementService with @(requires: 'authenticated-user');

annotate ProcurementService.PurchaseOrders with @(restrict: [
  // Requesters work on their own orders only; the condition is added to the database query.
  { grant: ['READ', 'CREATE', 'submit', 'reopen'], to: 'Requester', where: 'createdBy = $user' },
  // ... and may edit (draftEdit = UPDATE) or delete them only while nobody has approved them yet.
  { grant: ['UPDATE', 'DELETE'], to: 'Requester', where: 'createdBy = $user and status = ''Draft''' },
  { grant: ['READ', 'approve', 'reject'], to: 'Approver' },
  { grant: ['READ', 'send'],              to: 'Buyer' },
  { grant: '*',                           to: 'Admin' },
  { grant: 'READ',                        to: 'Auditor' }
]);

// Items follow their order: the restriction is checked via the path to the parent. Writes only
// while the order is a Draft - otherwise a requester could delete items of an approved order
// (DELETE on the active item, security review).
annotate ProcurementService.PurchaseOrderItems with @(restrict: [
  { grant: 'READ', to: 'Requester', where: 'parent.createdBy = $user' },
  { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'Requester', where: 'parent.createdBy = $user and parent.status = ''Draft''' },
  { grant: 'READ', to: ['Approver', 'Buyer', 'Auditor'] },
  { grant: '*',    to: 'Admin' }
]);

annotate ProcurementService.ApprovalLog with @(restrict: [
  { grant: 'READ', to: 'Requester', where: 'po.createdBy = $user' },
  { grant: 'READ', to: ['Approver', 'Buyer', 'Admin', 'Auditor'] }
]);

// Live S/4HANA data and the spend ranking are for purchasing staff only.
annotate ProcurementService.RemoteSuppliers with @(requires: ['Buyer', 'Admin']);
annotate ProcurementService.topSuppliers    with @(requires: ['Approver', 'Buyer', 'Admin', 'Auditor']);

// Products, Categories and Suppliers are @readonly value-help data: any authenticated user.

// ------------------------------------------------------------------ AdminService (master data)
annotate AdminService with @(requires: ['Buyer', 'Admin', 'Auditor']);

annotate AdminService.Suppliers  with @(restrict: [ { grant: '*', to: ['Buyer', 'Admin'] }, { grant: 'READ', to: 'Auditor' } ]);
annotate AdminService.Products   with @(restrict: [ { grant: '*', to: ['Buyer', 'Admin'] }, { grant: 'READ', to: 'Auditor' } ]);
annotate AdminService.Categories with @(restrict: [ { grant: '*', to: 'Admin' },           { grant: 'READ', to: ['Buyer', 'Auditor'] } ]);
