/**
 * What: End-to-end test of multitenancy and extensibility: starts the MTX sidecar and the app with
 *     profile with-mtx as separate processes (databases in a temp folder), subscribes tenants t1
 *     and t2, pushes an extension to t1, and checks data isolation, per-tenant number ranges and
 *     change history, the tenant-only extension field and the extension rules (prefix, allowlist).
 * Why: [CAP-STAGE-09] acceptance - "local MTX run with two tenants shows isolated data; extension
 *     adds a field in tenant A only". Running the real processes is the only way to test the
 *     sidecar/app split that production uses.
 * If missing or unlinked: A configuration change (profiles, sidecar plugins, extension rules) breaks
 *     tenant onboarding or isolation and nobody notices before the first customer subscribes.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'procurement-mtx-'));
// Every tenant gets <dir>/db-<tenant>.sqlite next to this file - keep them out of the project.
const env = { ...process.env, CDS_REQUIRES_DB_CREDENTIALS_URL: path.join(tmp, 'db.sqlite'), NO_TELEMETRY: 'true', NODE_ENV: '' };
const processes = [];

/** Starts `npx cds ...` and resolves with the URL from "server listening on ...". */
function start(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['cds', ...args, '--port', '0'], { cwd, env, detached: true });
    processes.push(child);
    let output = '';
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 60_000);
    const onData = (chunk) => {
      output += chunk;
      const match = /server listening on \{ url: '([^']+)'/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`exited with ${code}:\n${output}`)));
  });
}

/** fetch with mocked basic auth; resolves to { status, data } and never throws on HTTP errors. */
async function call(url, user, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`${user}:`).toString('base64')}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* $metadata is XML */ }
  return { status: res.status, data };
}

let sidecar, app;
const P = () => `${app}/odata/v4/procurement`;
const extensions = () => `${sidecar}/-/cds/extensibility/Extensions`;
const PO2 = 'd1000000-0000-4000-8000-000000000002';

describe('Multitenancy and extensibility (stage 09)', () => {
  before(async () => {
    sidecar = await start(['serve'], path.join(root, 'mtx', 'sidecar'));
    for (const tenant of ['t1', 't2']) {
      const { status } = await call(`${sidecar}/-/cds/deployment/subscribe`, 'yves', 'POST', { tenant });
      assert.ok(status < 300, `subscribe ${tenant}: ${status}`);
    }
    const ext = await call(`${extensions()}/delivery-note`, 'dave', 'PUT', {
      csn: ["extend acme.procurement.PurchaseOrders with { x_deliveryNote : String(255) @title: 'Delivery Note'; };"],
    });
    assert.equal(ext.status, 200, JSON.stringify(ext.data));
    app = await start(['serve', 'all', '--with-mocks', '--profile', 'with-mtx'], root);
  });

  after(() => {
    for (const child of processes) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates one database per subscribed tenant', () => {
    assert.ok(existsSync(path.join(tmp, 'db-t1.sqlite')));
    assert.ok(existsSync(path.join(tmp, 'db-t2.sqlite')));
  });

  it('isolates data: an order of tenant t2 is invisible in t1', async () => {
    const draft = (await call(`${P()}/PurchaseOrders`, 'fred', 'POST', { supplier_ID: 'a1000000-0000-4000-8000-000000000002' })).data;
    await call(`${P()}/PurchaseOrders(ID=${draft.ID},IsActiveEntity=false)/items`, 'fred', 'POST', { product_ID: 'b1000000-0000-4000-8000-000000000003', quantity: 1 });
    const activated = await call(`${P()}/PurchaseOrders(ID=${draft.ID},IsActiveEntity=false)/ProcurementService.draftActivate`, 'fred', 'POST', {});
    assert.equal(activated.status, 201);

    const t2 = (await call(`${P()}/PurchaseOrders?$select=orderNo`, 'erin')).data.value.map((po) => po.orderNo);
    const t1 = (await call(`${P()}/PurchaseOrders?$select=orderNo`, 'dave')).data.value.map((po) => po.orderNo);
    assert.equal(draft.orderNo, 'PO-1000005');
    assert.ok(t2.includes('PO-1000005'));
    assert.ok(!t1.includes('PO-1000005'));
    assert.equal(t1.length, 4);
    assert.equal(t2.length, 5);
  });

  it('keeps number ranges per tenant - both tenants issue PO-1000005 once', async () => {
    const t1 = (await call(`${P()}/PurchaseOrders`, 'alice', 'POST', { supplier_ID: 'a1000000-0000-4000-8000-000000000001' })).data;
    assert.equal(t1.orderNo, 'PO-1000005');
  });

  it('keeps change history per tenant', async () => {
    assert.equal((await call(`${P()}/PurchaseOrders(ID=${PO2},IsActiveEntity=true)/ProcurementService.approve`, 'bob', 'POST', { comment: 'ok' })).status, 200);
    const t1 = (await call(`${P()}/PurchaseOrders(ID=${PO2},IsActiveEntity=true)/changes`, 'dave')).data.value;
    const t2 = (await call(`${P()}/PurchaseOrders(ID=${PO2},IsActiveEntity=true)/changes`, 'erin')).data.value;
    assert.equal(t1.length, 1);
    assert.equal(t2.length, 0);
  });

  it('adds the extension field in tenant t1 only', async () => {
    assert.match((await call(`${P()}/$metadata`, 'dave')).data, /x_deliveryNote/);
    assert.doesNotMatch((await call(`${P()}/$metadata`, 'erin')).data, /x_deliveryNote/);

    const t1 = await call(`${P()}/PurchaseOrders`, 'alice', 'POST', { supplier_ID: 'a1000000-0000-4000-8000-000000000001', x_deliveryNote: 'DN-42' });
    assert.equal(t1.status, 201);
    assert.equal(t1.data.x_deliveryNote, 'DN-42');
    const t2 = await call(`${P()}/PurchaseOrders`, 'fred', 'POST', { supplier_ID: 'a1000000-0000-4000-8000-000000000001', x_deliveryNote: 'DN-42' });
    assert.equal(t2.status, 400);
  });

  it('enforces the extension rules: x_ prefix and entity allowlist', async () => {
    const noPrefix = await call(`${extensions()}/no-prefix`, 'dave', 'PUT', { csn: ['extend acme.procurement.PurchaseOrders with { deliveryNote2 : String(10); };'] });
    assert.equal(noPrefix.status, 422);
    assert.match(noPrefix.data.error.message, /must start with x_/);
    const notAllowed = await call(`${extensions()}/products`, 'dave', 'PUT', { csn: ['extend acme.procurement.Products with { x_color : String(10); };'] });
    assert.equal(notAllowed.status, 422);
    assert.match(notAllowed.data.error.message, /must not be extended/);
  });

  it('lets only extension developers push extensions', async () => {
    assert.equal((await call(`${extensions()}/x`, 'alice', 'PUT', { csn: [] })).status, 403); // no cds.ExtensionDeveloper role
    const t1 = await call(extensions(), 'dave');
    assert.deepEqual(t1.data.map((e) => e.ID), ['delivery-note']); // rejected extensions were not stored
  });
});
