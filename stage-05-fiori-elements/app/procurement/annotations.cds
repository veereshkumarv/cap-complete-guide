/**
 * What: UI annotations of the "Manage Purchase Orders" Fiori Elements app: list columns, filters,
 *     header, facets, field groups, value helps, currency semantics, side effects, status colour,
 *     action buttons and their availability per status.
 * Why: [CAP-M09] / [CAP-DEC-06] Fiori Elements renders the List Report and Object Page from these
 *     annotations; keeping them in CDS makes the UI upgrade-safe and reviewable.
 * If missing or unlinked: The app renders without columns, filters, sections or buttons, and the
 *     value help / total refresh stop working.
 */
using ProcurementService as service from '../../srv/procurement-service';

// ------------------------------------------------------------------ labels (app/_i18n/i18n*.properties)
annotate service.PurchaseOrders with {
  orderNo           @title: '{i18n>OrderNo}';
  supplier          @title: '{i18n>Supplier}';
  status            @title: '{i18n>Status}';
  totalAmount       @title: '{i18n>TotalAmount}' @Measures.ISOCurrency: currency_code;
  currency          @title: '{i18n>Currency}';
  statusCriticality @UI.Hidden;
};

annotate service.PurchaseOrderItems with {
  product    @title: '{i18n>Product}';
  quantity   @title: '{i18n>Quantity}';
  netPrice   @title: '{i18n>NetPrice}'   @Measures.ISOCurrency: parent.currency_code;
  itemAmount @title: '{i18n>ItemAmount}' @Measures.ISOCurrency: parent.currency_code;
};

annotate service.ApprovalLog with {
  approver @title: '{i18n>Approver}';
  decision @title: '{i18n>Decision}';
  comment  @title: '{i18n>Comment}';
};

// ------------------------------------------------------------------ list report + object page
annotate service.PurchaseOrders with @(
  UI.HeaderInfo         : {
    TypeName      : '{i18n>PurchaseOrder}',
    TypeNamePlural: '{i18n>PurchaseOrders}',
    Title         : { Value: orderNo },
    Description   : { Value: supplier.name }
  },
  UI.SelectionFields    : [ orderNo, supplier_ID, status ],
  UI.LineItem           : [
    { Value: orderNo },
    { Value: supplier_ID },
    { Value: status, Criticality: statusCriticality },
    { Value: totalAmount },
    { Value: createdBy, Label: '{i18n>Requester}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.submit',  Label: '{i18n>Submit}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.approve', Label: '{i18n>Approve}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.reject',  Label: '{i18n>Reject}' }
  ],
  UI.PresentationVariant: { SortOrder: [ { Property: orderNo, Descending: true } ], Visualizations: [ '@UI.LineItem' ] },
  UI.DataPoint #Status  : { Value: status, Title: '{i18n>Status}', Criticality: statusCriticality },
  UI.DataPoint #Total   : { Value: totalAmount, Title: '{i18n>TotalAmount}' },
  UI.HeaderFacets       : [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Total' }
  ],
  // Object page header buttons
  UI.Identification     : [
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.submit',  Label: '{i18n>Submit}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.approve', Label: '{i18n>Approve}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.reject',  Label: '{i18n>Reject}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.send',    Label: '{i18n>Send}' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.reopen',  Label: '{i18n>Reopen}' }
  ],
  UI.Facets             : [
    { $Type: 'UI.ReferenceFacet', ID: 'General', Label: '{i18n>General}', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Items',   Label: '{i18n>Items}',   Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Admin',   Label: '{i18n>Administration}', Target: '@UI.FieldGroup#Admin' }
  ],
  UI.FieldGroup #General: { Data: [
    { Value: orderNo },
    { Value: supplier_ID },
    { Value: currency_code },
    { Value: status, Criticality: statusCriticality },
    { Value: totalAmount }
  ] },
  UI.FieldGroup #Admin  : { Data: [
    { Value: createdBy }, { Value: createdAt }, { Value: modifiedBy }, { Value: modifiedAt }
  ] },
  // Refresh the stored total whenever items change ([CAP-M09] side effects)
  Common.SideEffects #ItemsChanged: { SourceEntities: [ items ], TargetProperties: [ 'totalAmount' ] }
);

// Value help and text for the supplier (shows the name instead of the UUID)
annotate service.PurchaseOrders with {
  supplier @Common: {
    Text           : supplier.name,
    TextArrangement: #TextOnly,
    ValueList      : {
      CollectionPath: 'Suppliers',
      Parameters    : [
        { $Type: 'Common.ValueListParameterInOut',       LocalDataProperty: supplier_ID, ValueListProperty: 'ID' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'country_code' }
      ]
    }
  };
};

annotate service.Suppliers with {
  ID   @Common: { Text: name, TextArrangement: #TextOnly } @title: '{i18n>Supplier}';
  name @title: '{i18n>SupplierName}';
};

// Status buttons are enabled only in the status where the transition is allowed (srv/lib/status.js),
// and every action refreshes the status, its colour, the header and the approval history.
annotate service.PurchaseOrders actions {
  submit  @Core.OperationAvailable: ($self.status = 'Draft')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ] };
  approve @Core.OperationAvailable: ($self.status = 'Submitted')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ], TargetEntities: [ 'in/approvals' ] }
          (comment @title: '{i18n>Comment}' @UI.MultiLineText);
  reject  @Core.OperationAvailable: ($self.status = 'Submitted')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ], TargetEntities: [ 'in/approvals' ] }
          (comment @title: '{i18n>Comment}' @UI.MultiLineText @mandatory);
  send    @Core.OperationAvailable: ($self.status = 'Approved')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ] };
  reopen  @Core.OperationAvailable: ($self.status = 'Rejected')
          @Common.SideEffects: { TargetProperties: [ 'in/status', 'in/statusCriticality' ] };
};

// ------------------------------------------------------------------ items table
annotate service.PurchaseOrderItems with @(
  UI.LineItem: [
    { Value: product_ID },
    { Value: quantity },
    { Value: netPrice },
    { Value: itemAmount }
  ],
  // Choosing a product defaults the price on the server - read it back.
  Common.SideEffects #ProductChanged: { SourceProperties: [ product_ID ], TargetProperties: [ 'netPrice', 'itemAmount' ] },
  Common.SideEffects #QuantityChanged: { SourceProperties: [ quantity, netPrice ], TargetProperties: [ 'itemAmount' ] }
) {
  product @Common: {
    Text           : product.name,
    TextArrangement: #TextFirst,
    ValueList      : {
      CollectionPath: 'Products',
      Parameters    : [
        { $Type: 'Common.ValueListParameterInOut',       LocalDataProperty: product_ID, ValueListProperty: 'ID' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'category_code' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'price' }
      ]
    }
  };
};

annotate service.Products with {
  ID    @Common: { Text: name, TextArrangement: #TextOnly } @title: '{i18n>Product}';
  name  @title: '{i18n>ProductName}';
  price @title: '{i18n>Price}' @Measures.ISOCurrency: currency_code;
};

// Approval history, rendered by the custom section ext/fragment/ApprovalHistory.fragment.xml
annotate service.ApprovalLog with @(UI.LineItem: [
  { Value: createdAt }, { Value: approver }, { Value: decision }, { Value: comment }
]);
