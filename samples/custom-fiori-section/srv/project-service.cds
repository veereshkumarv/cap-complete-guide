/**
 * What: ProjectService - draft-enabled projects with their milestones at /odata/v4/projects.
 * Why: [CAP-M03] minimal service for the extension sample; draft gives the Edit/Save flow that the
 *     controller extension hooks into (onBeforeSave).
 * If missing or unlinked: The Fiori app has no data source.
 */
using { sample.projects as db } from '../db/schema';

service ProjectService @(path: '/odata/v4/projects') {
  @odata.draft.enabled
  entity Projects   as projection on db.Projects;
  entity Milestones as projection on db.Milestones;
}
