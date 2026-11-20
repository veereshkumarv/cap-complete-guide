/**
 * What: Domain model of the draft-workflow sample: expense reports with their expense items.
 * Why: [CAP-M02] a parent-child composition is the typical draft use case - the report and its items
 *     are edited, validated and saved together; status and total are derived, never typed in.
 * If missing or unlinked: The ExpenseService projections fail to compile and no tables are deployed.
 */
using { cuid, managed, Currency } from '@sap/cds/common';

namespace sample.expenses;

type ReportStatus : String(10) enum { Draft; Submitted; Approved; Rejected; };

entity ExpenseReports : cuid, managed {
  title    : String(100) @mandatory;
  status   : ReportStatus default 'Draft' @readonly;
  total    : Decimal(11, 2) default 0 @readonly;
  currency : Currency;
  reason   : String(255) @readonly; // why it was rejected
  items    : Composition of many ExpenseItems on items.report = $self;
}

entity ExpenseItems : cuid {
  report      : Association to ExpenseReports;
  date        : Date;
  category    : String(20) enum { Travel; Hotel; Meals; Other; } default 'Other';
  description : String(255);
  amount      : Decimal(11, 2) @mandatory @assert.range: [0.01, 100000];
}
