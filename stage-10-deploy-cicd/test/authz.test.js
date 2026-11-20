/**
 * What: Authorization matrix tests: 401 for anonymous and unknown users, which orders each role
 *     sees (instance-based for requesters), role × operation for every status action, draft
 *     creation and editing, items, approval log, RemoteSuppliers, topSuppliers and AdminService.
 * Why: [CAP-STAGE-06] acceptance - "matrix test of role × operation passes (Section 2.5); 401/403
 *     behaviors verified". Restrictions are declarative; only tests prove they say what we mean.
 * If missing or unlinked: A typo in srv/authorizations.cds (wrong role name, missing where clause)
 *     silently opens data or blocks users, and nobody notices before production.
 */
const { describe, it } = require('node:test');
const { execFileSync } = require('node:child_process');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/..`, '--with-mocks'); // mock API_BUSINESS_PARTNER like cds watch
const { expect } = test;

const P = '/odata/v4/procurement';
const A = '/odata/v4/admin';
const PO1 = 'd1000000-0000-4000-8000-000000000001'; // alice, Draft
const PO2 = 'd1000000-0000-4000-8000-000000000002'; // alice, Submitted
const PO3 = 'd1000000-0000-4000-8000-000000000003'; // carol, Approved
const SUPPLIER = 'a1000000-0000-4000-8000-000000000001';
const active = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=true)`;
const draft = (ID) => `${P}/PurchaseOrders(ID=${ID},IsActiveEntity=false)`;

/** Sends a request as `user` (undefined = anonymous) and resolves to { status, data } - never throws. */
async function call(user, method, path, body) {
  const config = user ? { auth: { username: user, password: '' } } : {};
  const args = method === 'GET' || method === 'DELETE' ? [path, config] : [path, body ?? {}, config];
  try {
    const { status, data } = await test[method](...args);
    return { status, data };
  } catch (err) {
    return { status: err.status ?? err.response?.status, data: err.response?.data };
  }
}
const statusOf = async (...args) => (await call(...args)).status;

describe('Authentication (stage 06)', () => {
  it('rejects anonymous requests with 401 - also for $metadata', async () => {
    expect(await statusOf(undefined, 'GET', `${P}/PurchaseOrders`)).to.equal(401);
    expect(await statusOf(undefined, 'GET', `${P}/$metadata`)).to.equal(401);
    expect(await statusOf(undefined, 'GET', `${A}/Suppliers`)).to.equal(401);
  });

  it('rejects users that are not configured (no "*" wildcard) with 401', async () => {
    expect(await statusOf('zoe', 'GET', `${P}/PurchaseOrders`)).to.equal(401);
  });
});

describe('Who sees which orders (stage 06)', () => {
  it('shows requesters only their own orders, everybody else all orders', async () => {
    const seen = {};
    for (const user of ['alice', 'fred', 'bob', 'carol', 'dave', 'erin']) {
      const { data } = await call(user, 'GET', `${P}/PurchaseOrders?$select=orderNo&$orderby=orderNo`);
      seen[user] = data.value.map((po) => po.orderNo);
    }
    expect(seen.alice).to.deep.equal(['PO-1000001', 'PO-1000002', 'PO-1000004']);
    expect(seen.fred).to.deep.equal([]);
    for (const user of ['bob', 'carol', 'dave', 'erin']) expect(seen[user], user).to.have.length(4);
  });

  it('answers 404 (not 403) when a requester opens someone else\'s order - existence is not revealed', async () => {
    expect(await statusOf('alice', 'GET', active(PO3))).to.equal(404);
  });

  it('filters items and approval log by the owner of the order', async () => {
    const items = (await call('alice', 'GET', `${P}/PurchaseOrderItems?$select=parent_ID`)).data.value;
    expect(items.length).to.be.greaterThan(0);
    expect(items.every((i) => i.parent_ID !== PO3)).to.equal(true);
    expect((await call('fred', 'GET', `${P}/PurchaseOrderItems`)).data.value).to.have.length(0);

    const log = (await call('alice', 'GET', `${P}/ApprovalLog?$select=po_ID`)).data.value;
    expect(log.every((l) => l.po_ID !== PO3)).to.equal(true);
    expect((await call('erin', 'GET', `${P}/ApprovalLog`)).data.value.some((l) => l.po_ID === PO3)).to.equal(true);
  });
});

describe('Role × operation on purchase orders (stage 06)', () => {
  it('lets only Requesters and Admins create drafts', async () => {
    const expected = { alice: 201, fred: 201, dave: 201, bob: 403, carol: 403, erin: 403 };
    for (const [user, status] of Object.entries(expected)) {
      expect(await statusOf(user, 'POST', `${P}/PurchaseOrders`, { supplier_ID: SUPPLIER }), user).to.equal(status);
    }
  });

  it('submit: only the owning Requester', async () => {
    for (const user of ['fred', 'bob', 'carol', 'erin']) expect(await statusOf(user, 'POST', `${active(PO1)}/ProcurementService.submit`), user).to.equal(403);
    expect(await statusOf('alice', 'POST', `${active(PO1)}/ProcurementService.submit`)).to.equal(200);
  });

  it('approve: only Approvers (and Admins)', async () => {
    for (const user of ['alice', 'carol', 'erin']) expect(await statusOf(user, 'POST', `${active(PO1)}/ProcurementService.approve`, { comment: 'x' }), user).to.equal(403);
    expect(await statusOf('bob', 'POST', `${active(PO1)}/ProcurementService.approve`, { comment: 'ok' })).to.equal(200);
  });

  it('send: only Buyers (and Admins)', async () => {
    for (const user of ['alice', 'bob', 'erin']) expect(await statusOf(user, 'POST', `${active(PO1)}/ProcurementService.send`), user).to.equal(403);
    expect(await statusOf('carol', 'POST', `${active(PO1)}/ProcurementService.send`)).to.equal(200);
  });

  it('reject by an Approver, reopen by the owning Requester', async () => {
    expect(await statusOf('carol', 'POST', `${active(PO2)}/ProcurementService.reject`, { comment: 'no' })).to.equal(403);
    expect(await statusOf('bob', 'POST', `${active(PO2)}/ProcurementService.reject`, { comment: 'Wrong supplier' })).to.equal(200);
    expect(await statusOf('bob', 'POST', `${active(PO2)}/ProcurementService.reopen`)).to.equal(403);
    expect(await statusOf('alice', 'POST', `${active(PO2)}/ProcurementService.reopen`)).to.equal(200);
  });

  it('lets requesters edit or delete their orders only while in status Draft', async () => {
    // PO1 was sent to the supplier above - its content is frozen
    expect(await statusOf('alice', 'POST', `${active(PO1)}/ProcurementService.draftEdit`, { PreserveChanges: true })).to.equal(403);
    expect(await statusOf('alice', 'DELETE', active(PO1))).to.equal(403);
    // PO2 is back in Draft after reopen - editable again, but not by another requester
    expect(await statusOf('fred', 'POST', `${active(PO2)}/ProcurementService.draftEdit`, { PreserveChanges: true })).to.equal(403);
    expect(await statusOf('alice', 'POST', `${active(PO2)}/ProcurementService.draftEdit`, { PreserveChanges: true })).to.equal(201);
    expect(await statusOf('fred', 'GET', draft(PO2))).to.equal(404);
    expect(await statusOf('alice', 'DELETE', draft(PO2))).to.equal(204); // discard the draft
  });

  it('tells the UI per user whether Edit/Delete are possible (canEdit), even if only canEdit is selected', async () => {
    const canEdit = async (user, ID) => (await call(user, 'GET', `${active(ID)}?$select=canEdit`)).data.canEdit;
    expect(await canEdit('alice', PO2)).to.equal(true); // her own order, back in Draft
    expect(await canEdit('bob', PO2)).to.equal(false); // Approvers never edit
    expect(await canEdit('dave', PO2)).to.equal(true); // Admin
    expect(await canEdit('alice', PO1)).to.equal(false); // sent to supplier
  });

  it('lets Admins do everything', async () => {
    const { data: po } = await call('dave', 'POST', `${P}/PurchaseOrders`, { supplier_ID: SUPPLIER });
    expect(await statusOf('dave', 'DELETE', draft(po.ID))).to.equal(204);
    expect(await statusOf('dave', 'GET', `${P}/RemoteSuppliers?$top=1`)).to.equal(200);
  });
});

describe('Functions, remote data and master data (stage 06)', () => {
  it('RemoteSuppliers: Buyers and Admins only', async () => {
    expect(await statusOf('alice', 'GET', `${P}/RemoteSuppliers`)).to.equal(403);
    expect(await statusOf('erin', 'GET', `${P}/RemoteSuppliers`)).to.equal(403);
    expect(await statusOf('carol', 'GET', `${P}/RemoteSuppliers?$top=1`)).to.equal(200);
  });

  it('topSuppliers: everybody except Requesters', async () => {
    expect(await statusOf('alice', 'GET', `${P}/topSuppliers(limit=3)`)).to.equal(403);
    for (const user of ['bob', 'carol', 'dave', 'erin']) expect(await statusOf(user, 'GET', `${P}/topSuppliers(limit=3)`), user).to.equal(200);
  });

  it('value-help data is readable by every authenticated user', async () => {
    for (const entity of ['Products', 'Suppliers', 'Categories']) expect(await statusOf('fred', 'GET', `${P}/${entity}?$top=1`), entity).to.equal(200);
  });

  it('AdminService: Buyers maintain suppliers and products, Admins categories, Auditors read', async () => {
    expect(await statusOf('alice', 'GET', `${A}/Suppliers`)).to.equal(403);
    expect(await statusOf('bob', 'GET', `${A}/Suppliers`)).to.equal(403);
    expect(await statusOf('erin', 'GET', `${A}/Suppliers`)).to.equal(200);
    expect(await statusOf('erin', 'POST', `${A}/Suppliers`, { name: 'Audit Corp' })).to.equal(403);
    expect(await statusOf('carol', 'POST', `${A}/Suppliers`, { name: 'Nordic Paper AB', country_code: 'DE' })).to.equal(201);
    expect(await statusOf('carol', 'POST', `${A}/Categories`, { code: 'TOOLS', name: 'Tools' })).to.equal(403);
    expect(await statusOf('dave', 'POST', `${A}/Categories`, { code: 'TOOLS', name: 'Tools' })).to.equal(201);
  });
});

describe('Production configuration (stage 06)', () => {
  it('uses XSUAA in production and mocked users otherwise', () => {
    expect(cds.env.requires.auth.kind).to.equal('mocked');
    // the effective configuration of another profile is easiest to read through the CLI
    const prod = execFileSync('npx', ['cds', 'env', 'requires.auth.kind', '--profile', 'production'], { cwd: `${__dirname}/..`, encoding: 'utf8' });
    expect(prod.trim()).to.equal('xsuaa');
  });

  it('declares one XSUAA scope and role template per role used in @restrict / @requires', () => {
    const xs = require('../xs-security.json');
    const roles = ['Requester', 'Approver', 'Buyer', 'Admin', 'Auditor'];
    // stage 09: + mtcallback (SaaS registry calls the subscription API) and cds.ExtensionDeveloper (cds push)
    // stage 10: + emcallback / emmanagement (SAP Event Mesh webhooks and queue management)
    const scopes = [...roles, 'mtcallback', 'cds.ExtensionDeveloper', 'emcallback', 'emmanagement'].map((r) => `$XSAPPNAME.${r}`);
    expect(xs.scopes.map((s) => s.name).sort()).to.deep.equal(scopes.sort());
    expect(xs['role-templates'].map((t) => t.name).sort()).to.deep.equal([...roles, 'ExtensionDeveloper'].sort());
  });
});
