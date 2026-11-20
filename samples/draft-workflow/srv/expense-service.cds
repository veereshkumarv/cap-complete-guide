/**
 * What: ExpenseService - draft-enabled expense reports with the bound actions submit, approve and
 *     reject, plus a virtual status colour for the UI.
 * Why: [CAP-M03] draft for multi-field editing, [CAP-M06] / [CAP-DEC-03] state changes only through
 *     bound actions (status is @readonly), never through a PATCH.
 * If missing or unlinked: There is no API for the Fiori app, and srv/expense-service.js has nothing
 *     to implement.
 */
using { sample.expenses as db } from '../db/schema';

service ExpenseService @(path: '/odata/v4/expenses') {
  @odata.draft.enabled
  entity ExpenseReports as projection on db.ExpenseReports {
    *,
    virtual null as statusCriticality : Integer
  } actions {
    /** Draft -> Submitted; needs at least one item. */
    action submit()               returns ExpenseReports;
    /** Submitted -> Approved. */
    action approve()              returns ExpenseReports;
    /** Submitted -> Rejected; a reason is mandatory. */
    action reject(reason: String) returns ExpenseReports;
  };
  entity ExpenseItems as projection on db.ExpenseItems;
}
