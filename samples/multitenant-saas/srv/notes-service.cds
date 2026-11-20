/**
 * What: NotesService at /odata/v4/notes - read and write the notes of the caller's tenant.
 * Why: [CAP-M20] the service code is tenant-agnostic: CAP routes each request to the database of
 *     the user's tenant; nothing in the service mentions tenants.
 * If missing or unlinked: The app serves no endpoints and the isolation cannot be observed.
 */
using { sample.saas as db } from '../db/schema';

service NotesService @(path: '/odata/v4/notes', requires: 'authenticated-user') {
  entity Notes as projection on db.Notes;
}
