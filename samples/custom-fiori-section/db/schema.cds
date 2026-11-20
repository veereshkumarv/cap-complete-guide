/**
 * What: Domain model of the custom-fiori-section sample: projects with budget and spent amount, and
 *     their milestones.
 * Why: [CAP-M10] budget vs. spent is a typical value that standard facets show as two numbers; the
 *     custom section visualises it as a progress bar.
 * If missing or unlinked: ProjectService fails to compile and no tables are deployed.
 */
using { cuid, managed, Currency } from '@sap/cds/common';

namespace sample.projects;

entity Projects : cuid, managed {
  name       : String(100) @mandatory;
  owner      : String(100);
  budget     : Decimal(11, 2);
  spent      : Decimal(11, 2);
  currency   : Currency;
  milestones : Composition of many Milestones on milestones.project = $self;
}

entity Milestones : cuid {
  project : Association to Projects;
  title   : String(100);
  due     : Date;
  done    : Boolean default false;
}
