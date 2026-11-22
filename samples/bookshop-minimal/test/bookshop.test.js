/**
 * What: Tests of the minimal bookshop: catalog reads with $expand, read-only catalog, admin
 *     create, and input validation from annotations.
 * Why: [CAP-M04] / [CAP-M24] the smallest cds.test setup - in-process server, in-memory SQLite,
 *     HTTP helpers.
 * If missing or unlinked: npm test has nothing to run and a broken model or CSV goes unnoticed.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { GET, POST, expect } = cds.test(`${__dirname}/..`);
const fail = (p) => p.then(() => { throw new Error('expected an error response'); }, (e) => e);

describe('bookshop-minimal', () => {
  it('lists books with their author ($expand)', async () => {
    const { data } = await GET('/odata/v4/catalog/Books?$expand=author($select=name)&$orderby=title');
    expect(data.value).to.have.length(3);
    expect(data.value[0]).to.deep.include({ title: 'Eleonora', author: { ID: 'aa000000-0000-4000-8000-000000000002', name: 'Edgar Allan Poe' } });
  });

  it('navigates from an author to the books', async () => {
    const { data } = await GET('/odata/v4/catalog/Authors(aa000000-0000-4000-8000-000000000002)/books?$select=title&$orderby=title');
    expect(data.value.map((b) => b.title)).to.deep.equal(['Eleonora', 'The Raven']);
  });

  it('keeps the catalog read-only (405)', async () => {
    expect((await fail(POST('/odata/v4/catalog/Books', { title: 'x' }))).status).to.equal(405);
  });

  it('lets the admin service create books', async () => {
    const { status, data } = await POST('/odata/v4/admin/Books', { title: 'Jane Eyre', author_ID: 'aa000000-0000-4000-8000-000000000001', stock: 5 });
    expect(status).to.equal(201);
    expect(data.createdAt).to.be.a('string'); // managed aspect
  });

  it('validates input declared in the model (@mandatory, @assert.range)', async () => {
    const err = await fail(POST('/odata/v4/admin/Books', { title: 'Too many', author_ID: 'aa000000-0000-4000-8000-000000000001', stock: -1 }));
    expect(err.status).to.equal(400);
  });

  it('rejects a book whose author does not exist (@assert.target)', async () => {
    const err = await POST('/odata/v4/admin/Books', { title: 'Orphan', author_ID: '00000000-0000-4000-8000-0000000000ff' }).catch((e) => e);
    expect(err.status).to.equal(400);
  });
});
