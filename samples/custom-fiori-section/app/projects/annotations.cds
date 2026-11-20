/**
 * What: UI annotations of the "Projects" app: list, header, standard facets (General, Milestones).
 *     The Budget section is NOT an annotation - it is the custom section from manifest.json.
 * Why: [CAP-M10] extensions start where annotations end: everything standard stays annotation-based
 *     ("annotations -> manifest -> fragment -> controller extension -> freestyle").
 * If missing or unlinked: The app renders without columns and standard sections.
 */
using ProjectService as service from '../../srv/project-service';

annotate service.Projects with {
  name     @title: '{i18n>Name}';
  owner    @title: '{i18n>Owner}';
  budget   @title: '{i18n>Budget}' @Measures.ISOCurrency: currency_code;
  spent    @title: '{i18n>Spent}'  @Measures.ISOCurrency: currency_code;
  currency @title: '{i18n>Currency}';
};

annotate service.Milestones with {
  title @title: '{i18n>Milestone}';
  due   @title: '{i18n>Due}';
  done  @title: '{i18n>Done}';
};

annotate service.Projects with @(
  UI.HeaderInfo        : { TypeName: '{i18n>Project}', TypeNamePlural: '{i18n>Projects}', Title: { Value: name }, Description: { Value: owner } },
  UI.SelectionFields   : [ owner ],
  UI.LineItem          : [ { Value: name }, { Value: owner }, { Value: budget }, { Value: spent } ],
  UI.Facets            : [
    { $Type: 'UI.ReferenceFacet', ID: 'General',    Label: '{i18n>General}',    Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Milestones', Label: '{i18n>Milestones}', Target: 'milestones/@UI.LineItem' }
  ],
  UI.FieldGroup #General: { Data: [ { Value: name }, { Value: owner }, { Value: budget }, { Value: spent }, { Value: currency_code } ] }
);

annotate service.Milestones with @(UI.LineItem: [ { Value: title }, { Value: due }, { Value: done } ]);
