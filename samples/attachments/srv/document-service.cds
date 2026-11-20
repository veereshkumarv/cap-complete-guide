/**
 * What: DocumentService - CRUD on documents; the content is uploaded and downloaded through the
 *     media resource path /Documents(<ID>)/content.
 * Why: [CAP-M15] one entity is enough: metadata via JSON, bytes via streaming - never base64 in JSON.
 * If missing or unlinked: The sample has no endpoints; srv/document-service.js has nothing to guard.
 */
using { sample.attachments as db } from '../db/schema';

service DocumentService @(path: '/odata/v4/documents') {
  entity Documents as projection on db.Documents;
}
