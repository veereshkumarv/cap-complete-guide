/**
 * What: Tests of the attachments sample: upload via PUT .../content, download with Content-Type and
 *     Content-Disposition, size stored, binary content kept out of the JSON, rejected media types
 *     (415), files over 1 MB rejected by Content-Length and while streaming without it (413), and
 *     the previous file kept after a rejected upload.
 * Why: [CAP-M15] uploads are untrusted input; each guard must be proven, including the chunked
 *     upload that has no Content-Length header.
 * If missing or unlinked: A regression in the upload guard lets large or dangerous files in.
 */
const { describe, it, before } = require('node:test');
const { Readable } = require('node:stream');
const cds = require('@sap/cds');

const { GET, POST, PUT, expect } = cds.test(`${__dirname}/..`);

const P = '/odata/v4/documents';
const text = (type = 'text/plain') => ({ headers: { 'Content-Type': type } });
const fail = (promise) => promise.then(() => { throw new Error('expected an error response'); }, (e) => e);

describe('Documents with media content', () => {
  let doc;
  before(async () => {
    ({ data: doc } = await POST(`${P}/Documents`, { title: 'Quote Bürotec', fileName: 'quote.txt' }));
  });

  it('uploads the file with PUT on the content element', async () => {
    const { status } = await PUT(`${P}/Documents(${doc.ID})/content`, 'Quote: 4 office chairs', text());
    expect(status).to.equal(204);
  });

  it('downloads it with media type and file name from the annotated elements', async () => {
    const res = await GET(`${P}/Documents(${doc.ID})/content`);
    expect(String(res.data)).to.equal('Quote: 4 office chairs');
    expect(res.headers['content-type']).to.match(/^text\/plain/);
    expect(res.headers['content-disposition']).to.equal('attachment; filename="quote.txt"');
  });

  it('stores the size and keeps the bytes out of the JSON representation', async () => {
    const { data } = await GET(`${P}/Documents(${doc.ID})`);
    expect(data).to.include({ mimeType: 'text/plain', size: 22 });
    expect(data).to.not.have.property('content');
  });

  it('rejects media types that are not allowed (415)', async () => {
    const err = await fail(PUT(`${P}/Documents(${doc.ID})/content`, 'MZ...', text('application/x-msdownload')));
    expect(err.status).to.equal(415);
  });

  it('rejects files over 1 MB announced by Content-Length (413)', async () => {
    const err = await fail(PUT(`${P}/Documents(${doc.ID})/content`, 'x'.repeat(1024 * 1024 + 1), text()));
    expect(err.status).to.equal(413);
  });

  it('rejects files over 1 MB while streaming, without Content-Length (413)', async () => {
    const chunks = Array.from({ length: 5 }, () => Buffer.alloc(300 * 1024, 120)); // 1.5 MB, chunked
    const err = await fail(PUT(`${P}/Documents(${doc.ID})/content`, Readable.from(chunks), text()));
    expect(err.status).to.equal(413);
  });

  it('keeps the previous file after a rejected upload (transaction rolled back)', async () => {
    const res = await GET(`${P}/Documents(${doc.ID})/content`);
    expect(String(res.data)).to.equal('Quote: 4 office chairs');
  });

});
