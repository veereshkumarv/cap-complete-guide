<!--
What: Guide for the attachments sample: storing files with LargeBinary and CAP's built-in media
    handling - upload, download, media type and file name annotations, size and type validation.
Why: [CAP-S07] focused sample for [CAP-M15]; the do-it-yourself counterpart to the
    @cap-js/attachments plugin used in stage 08, so learners see what the plugin does for them.
If missing or unlinked: Learners copy the annotations without the validation rules, and the DoD
    report marks the sample incomplete.
-->

# Sample: attachments - media data without a plugin

## Purpose

Store documents (contracts, quotes) with their binary content using only CAP core features:
a `LargeBinary` element annotated as media resource, streamed upload and download, and an upload
guard for media types and file size.

## Module reference

- [CAP-M15 Attachments & Media](../../CAP_DEVELOPMENT_GUIDE.md#cap-m15-attachments--media)
- Plugin variant in context: [stage 08](../../stage-08-advanced-features/README.md)

## Prerequisites

Node.js 22/24 and `npm install` at the repository root. No BTP account.

## Folder structure

```
attachments/
├─ package.json
├─ db/schema.cds                     # Documents: content LargeBinary + media annotations
├─ srv/document-service.cds          # DocumentService
├─ srv/document-service.js           # upload guard: types, 1 MB limit (also while streaming), size
└─ test/attachments.test.js, test/requests.http
```

## How to run

```sh
cd samples/attachments
npm run watch
```

Run `test/requests.http`: create a document (1), upload text (2), download it (3) - the browser
saves it as `quote.txt` because of `Content-Disposition: attachment`.

## How to test

```sh
npm test
```

10 tests pass (2 files): upload, download headers, stored size and no bytes in JSON, 415 for a wrong type,
413 for a large file with and without `Content-Length`, previous file kept after a rejection.

## Key concepts

- **Media element** - the annotations make `/Documents(<ID>)/content` a stream endpoint:
  ```cds
  mimeType : String @Core.IsMediaType;
  content  : LargeBinary @Core.MediaType: mimeType @Core.ContentDisposition.Filename: fileName;
  ```
- **Two steps** - create the entity with JSON, then `PUT` the bytes with their `Content-Type`
  (CAP stores it in `mimeType`). Never send files base64-encoded inside JSON.
- **Streaming** - the handler receives a `Readable`; it is piped through a counting `Transform`, so
  the 1 MB limit also holds for chunked uploads without `Content-Length`.
- **Transactions** - a rejected upload rolls back; the previous content stays.
- **Not in JSON** - `LargeBinary` elements are not returned in entity reads; clients fetch them
  separately (the OData adapter adds the media read link).

## When to use / When not to use

| Approach | Use when | Avoid when |
|----------|----------|------------|
| this sample (`LargeBinary` in the DB) | few, small files; no scanning requirement; full control | many/large files, user uploads from the internet |
| `@cap-js/attachments` (stage 08) | standard attachments on business objects, object store, malware scanning, Fiori UI | you need a custom storage or UI |
| object store directly | very large media, CDN delivery | transactional consistency with business data is required |

## Impact & trade-offs

| Aspect | Impact |
|--------|--------|
| Storage | files inflate the database, its backups and HANA memory - set limits |
| Security | validate type and size; scan for malware (not included here - use the plugin + Malware Scanning service) |
| Performance | streaming keeps memory flat; never `SELECT` content in list queries |
| Consistency | file and metadata commit together (same transaction) |

## Visuals

```mermaid
sequenceDiagram
  participant C as Client
  participant S as DocumentService
  participant DB as Database
  C->>S: POST /Documents {title, fileName}
  S->>DB: INSERT
  C->>S: PUT /Documents(ID)/content (Content-Type: text/plain, stream)
  S->>S: type allowed? Content-Length <= 1 MB? count bytes while streaming
  S->>DB: UPDATE content, mimeType, size (one transaction)
  C->>S: GET /Documents(ID)/content
  S-->>C: bytes + Content-Type + Content-Disposition: attachment; filename="quote.txt"
```

## Deviations from guide

| Guide | Here | Reason |
|-------|------|--------|
| "`@cap-js/attachments` or `LargeBinary` + `@Core.MediaType`" | `LargeBinary` here, plugin in stage 08 | contrast both approaches |
| AV scanning for uploads | not included | needs the SAP Malware Scanning service; the plugin integrates it |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| download has no file name | `@Core.ContentDisposition.Filename` missing or `fileName` empty | annotate and fill `fileName` |
| `content-type: application/octet-stream` | upload sent without `Content-Type` | send the real media type |
| 415 | type not in `ALLOWED` | extend the list in `srv/document-service.js` deliberately |
| 413 | file over 1 MB | raise `MAX_BYTES` only together with storage planning |
| server stops after an upload | an error thrown in a `succeeded`/stream callback (programming error) | do follow-up writes in `after` handlers inside the transaction |

## References

- https://cap.cloud.sap/docs/guides/providing-services#serving-media-data
- https://cap.cloud.sap/docs/node.js/best-practices#streaming
- https://github.com/cap-js/attachments
