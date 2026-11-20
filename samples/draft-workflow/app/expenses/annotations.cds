/**
 * What: UI annotations of the "My Expense Reports" app: list, filters, header, facets, items table,
 *     status colour, action buttons enabled per status, and the side effects that refresh the total.
 * Why: [CAP-M09] / [CAP-M06] Fiori Elements renders draft editing, buttons and refreshes from these
 *     annotations - no controller code. The side effects are what makes the total "live".
 * If missing or unlinked: No columns or buttons, and the total only updates after saving.
 */
using ExpenseService as service from '../../srv/expense-service';

annotate service.ExpenseReports with {
  title             @title: '{i18n>Title}';
  status            @title: '{i18n>Status}';
  total             @title: '{i18n>Total}' @Measures.ISOCurrency: currency_code;
  currency          @title: '{i18n>Currency}';
  reason            @title: '{i18n>Reason}';
  statusCriticality @UI.Hidden;
};

annotate service.ExpenseItems with {
  date        @title: '{i18n>Date}';
  category    @title: '{i18n>Category}';
  description @title: '{i18n>Description}';
  amount      @title: '{i18n>Amount}' @Measures.ISOCurrency: report.currency_code;
};

annotate service.ExpenseReports with @(
  UI.HeaderInfo      : { TypeName: '{i18n>Report}', TypeNamePlural: '{i18n>Reports}', Title: { Value: title }, Description: { Value: status } },
  UI.SelectionFields : [ status ],
  UI.LineItem        : [
    { Value: title },
    { Value: status, Criticality: statusCriticality },
    { Value: total },
    { Value: createdBy, Label: '{i18n>Owner}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ExpenseService.submit', Label: '{i18n>Submit}' }
  ],
  UI.DataPoint #Total: { Value: total, Title: '{i18n>Total}' },
  UI.DataPoint #Status: { Value: status, Title: '{i18n>Status}', Criticality: statusCriticality },
  UI.HeaderFacets    : [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Total' }
  ],
  UI.Identification  : [
    { $Type: 'UI.DataFieldForAction', Action: 'ExpenseService.submit',  Label: '{i18n>Submit}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ExpenseService.approve', Label: '{i18n>Approve}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ExpenseService.reject',  Label: '{i18n>Reject}' }
  ],
  UI.Facets          : [
    { $Type: 'UI.ReferenceFacet', ID: 'General', Label: '{i18n>General}', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Items',   Label: '{i18n>Items}',   Target: 'items/@UI.LineItem' }
  ],
  UI.FieldGroup #General: { Data: [ { Value: title }, { Value: currency_code }, { Value: total }, { Value: reason } ] },
  // Any change in the items table -> re-read the stored total of the report
  Common.SideEffects #Items: { SourceEntities: [ items ], TargetProperties: [ 'total' ] }
);

annotate service.ExpenseItems with @(
  UI.LineItem: [ { Value: date }, { Value: category }, { Value: description }, { Value: amount } ],
  // Changing an amount -> re-read the parent's total (path from the item to its report)
  Common.SideEffects #Amount: { SourceProperties: [ amount ], TargetProperties: [ 'report/total' ] }
);

annotate service.ExpenseReports actions {
  submit  @Core.OperationAvailable: ($self.status = 'Draft')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ] };
  approve @Core.OperationAvailable: ($self.status = 'Submitted')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ] };
  reject  @Core.OperationAvailable: ($self.status = 'Submitted')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality', 'in/reason' ] }
          (reason @title: '{i18n>Reason}' @mandatory);
};
