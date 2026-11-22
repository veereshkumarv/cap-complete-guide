/**
 * What: Tests that file content and media types cannot bypass the upload checks through the
 *     metadata requests: no base64 content in a JSON body, no forbidden mimeType by PATCH.
 * Why: [CAP-M15] security review - the size/type checks run on the media stream (PUT .../content);
 *     without these guards a JSON POST or PATCH could store e.g. text/html unchecked.
 * If missing or unlinked: A regression of the metadata guards in srv/document-service.js goes
 *     unnoticed. (Own file: runs in its own server, independent of the streaming tests.)
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { POST, PATCH, expect } = cds.test(`${__dirname}/..`);

const P = '/odata/v4/documents';
const fail = (promise) => promise.then(() => { throw new Error('expected an error response'); }, (e) => e);

describe('Documents metadata guards', () => {
  it('rejects file content inside a JSON body - the stream checks would be bypassed (400)', async () => {
    const err = await fail(POST(`${P}/Documents`, { title: 'bypass', mimeType: 'text/plain', content: Buffer.from('x').toString('base64') }));
    expect(err.status).to.equal(400);
  });

  it('rejects a media type changed to a forbidden one by PATCH (415)', async () => {
    const { data } = await POST(`${P}/Documents`, { title: 'meta only' });
    const err = await fail(PATCH(`${P}/Documents(${data.ID})`, { mimeType: 'text/html' }));
    expect(err.status).to.equal(415);
  });

  it('accepts an allowed media type set as metadata', async () => {
    const { data } = await POST(`${P}/Documents`, { title: 'pdf', mimeType: 'application/pdf' });
    expect(data.mimeType).to.equal('application/pdf');
  });
});
