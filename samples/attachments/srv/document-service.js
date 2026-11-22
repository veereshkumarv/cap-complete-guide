/**
 * What: Upload guard of DocumentService: only allowed media types, at most 1 MB per file (checked
 *     while streaming, not only via Content-Length), and the stored size of each file.
 * Why: [CAP-M15] uploads are untrusted input - without limits a client can fill the database or
 *     store executable content; this is what the attachments plugin (plus malware scanning) does
 *     for you in stage 08.
 * If missing or unlinked: Any file of any size and type is accepted and stored.
 */
const cds = require('@sap/cds');
const { Transform } = require('node:stream');

const MAX_BYTES = 1024 * 1024; // 1 MB
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

module.exports = class DocumentService extends cds.ApplicationService {
  init() {
    const { Documents } = this.entities;
    const sizes = new WeakMap(); // request -> bytes counted while streaming

    // Metadata (POST / PATCH): files only through the media stream (PUT .../content) - otherwise a
    // JSON body with base64 content would bypass every check below (security review). A media type
    // set separately must be allowed too, or the stored file would be served as e.g. text/html.
    this.before(['CREATE', 'UPDATE'], Documents, (req) => {
      const { content, mimeType } = req.data;
      const url = req.http?.req?.originalUrl ?? '';
      const mediaPath = /\/(content|\$value)(\?|$)/.test(url); // PUT .../content streams the file
      if (content !== undefined && content !== null && req.http && !mediaPath) {
        return req.reject(400, 'Upload the file with PUT .../content, not inside the JSON body.');
      }
      if (mimeType !== undefined && mimeType !== null && !ALLOWED.includes(String(mimeType).split(';')[0].trim())) {
        return req.reject(415, `File type "${mimeType}" is not allowed (${ALLOWED.join(', ')}).`);
      }
      if (content === null) req.data.size = null; // file removed - no stale size
    });

    this.before('UPDATE', Documents, (req) => {
      const { content } = req.data;
      if (content === undefined || content === null) return; // metadata update, or file removed

      const type = (req.data.mimeType ?? req.headers?.['content-type'] ?? '').split(';')[0].trim();
      if (!ALLOWED.includes(type)) return req.reject(415, `File type "${type}" is not allowed (${ALLOWED.join(', ')}).`);
      const declared = Number(req.headers?.['content-length']);
      if (declared > MAX_BYTES) return req.reject(413, 'The file is larger than 1 MB.');

      // Content-Length can be absent or wrong (chunked uploads): count the bytes while streaming.
      sizes.set(req, 0);
      req.data.content = content.pipe(new Transform({
        transform(chunk, _encoding, done) {
          const size = sizes.get(req) + chunk.length;
          sizes.set(req, size);
          if (size > MAX_BYTES) return done(cds.error(413, 'The file is larger than 1 MB.'));
          done(null, chunk);
        },
      }));
    });

    // the stream has been written by now - store its size in the same transaction
    this.after('UPDATE', Documents, async (_, req) => {
      if (sizes.has(req)) await UPDATE(Documents, req.data.ID).with({ size: sizes.get(req) });
    });

    return super.init();
  }
};
