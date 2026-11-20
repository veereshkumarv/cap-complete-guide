/**
 * What: Documents with binary content: the file is a LargeBinary element whose media type and
 *     download file name come from sibling elements.
 * Why: [CAP-M15] the annotations tell CAP's OData adapter to stream the content (PUT/GET .../content)
 *     with the right Content-Type and Content-Disposition headers.
 * If missing or unlinked: srv/document-service.cds has nothing to expose and uploads have nowhere
 *     to go.
 */
using { cuid, managed } from '@sap/cds/common';

namespace sample.attachments;

entity Documents : cuid, managed {
  title    : String(100) @mandatory;
  fileName : String(255);
  mimeType : String(100) @Core.IsMediaType;
  content  : LargeBinary @Core.MediaType: mimeType @Core.ContentDisposition.Filename: fileName
                         @Core.ContentDisposition.Type: 'attachment';
  size     : Integer @readonly; // bytes, set by the upload handler
}
