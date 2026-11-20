/**
 * What: End-to-end test of the multitenant sample: starts the MTX sidecar and the app (profile
 *     with-mtx) as child processes with tenant databases in a temp folder, subscribes t1 and t2,
 *     checks data isolation, upgrades all tenants, enforces the x_ extension rule, and unsubscribes
 *     t2 (its database is deleted).
 * Why: [CAP-M20] / [CAP-S07] the tenant lifecycle only works with the real sidecar/app split, so the
 *     test runs both processes exactly like `npm run watch:sidecar` + `npm run watch:mtx`.
 * If missing or unlinked: A broken profile, sidecar config or user/tenant mapping is only found by
 *     hand.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'sample-saas-'));
// tenant databases become <tmp>/db-<tenant>.sqlite - never inside the project
const env = { ...process.env, CDS_REQUIRES_DB_CREDENTIALS_URL: path.join(tmp, 'db.sqlite'), NODE_ENV: '' };
const processes = [];

/** Starts `npx cds ...` on a free port and resolves with its URL. */
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

/** fetch with mocked basic auth; resolves to { status, data }. */
async function call(url, user, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`${user}:`).toString('base64')}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* empty or plain body */ }
  return { status: res.status, data };
}

let sidecar, app;
const notes = (user) => call(`${app}/odata/v4/notes/Notes?$select=text&$orderby=createdAt`, user);

describe('Multitenant SaaS sample', () => {
  before(async () => {
    sidecar = await start(['serve'], path.join(root, 'mtx', 'sidecar'));
    for (const tenant of ['t1', 't2']) {
      const { status } = await call(`${sidecar}/-/cds/deployment/subscribe`, 'yves', 'POST', { tenant });
      assert.ok(status < 300, `subscribe ${tenant}: ${status}`);
    }
    app = await start(['serve', 'all', '--profile', 'with-mtx'], root);
  });

  after(() => {
    for (const child of processes) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates one database per subscribed tenant, each with the initial data', async () => {
    assert.ok(existsSync(path.join(tmp, 'db-t1.sqlite')));
    assert.ok(existsSync(path.join(tmp, 'db-t2.sqlite')));
    assert.equal((await notes('alice')).data.value.length, 1);
    assert.equal((await notes('carol')).data.value.length, 1);
  });

  it('isolates data: a note of tenant t1 is invisible in t2', async () => {
    assert.equal((await call(`${app}/odata/v4/notes/Notes`, 'alice', 'POST', { text: 'only for t1' })).status, 201);
    assert.deepEqual((await notes('bob')).data.value.map((n) => n.text).at(-1), 'only for t1'); // same tenant
    assert.ok(!(await notes('carol')).data.value.some((n) => n.text === 'only for t1'));
  });

  it('requires a user - the tenant comes from the user', async () => {
    const anonymous = await fetch(`${app}/odata/v4/notes/Notes`);
    assert.equal(anonymous.status, 401);
  });

  it('upgrades all tenants after a model change', async () => {
    const { status } = await call(`${sidecar}/-/cds/saas-provisioning/upgrade`, 'yves', 'POST', { tenants: ['*'] });
    assert.ok(status < 300, `upgrade: ${status}`);
    // data survives the upgrade
    assert.ok((await notes('alice')).data.value.some((n) => n.text === 'only for t1'));
  });

  it('accepts only extensions that follow the x_ prefix rule', async () => {
    const bad = await call(`${sidecar}/-/cds/extensibility/Extensions/bad`, 'alice', 'PUT', { csn: ['extend sample.saas.Notes with { color : String(10); };'] });
    assert.equal(bad.status, 422);
    assert.match(bad.data.error.message, /must start with x_/);
    const good = await call(`${sidecar}/-/cds/extensibility/Extensions/color`, 'alice', 'PUT', { csn: ['extend sample.saas.Notes with { x_color : String(10); };'] });
    assert.equal(good.status, 200, JSON.stringify(good.data));
  });

  it('unsubscribes a tenant and deletes its database', async () => {
    const { status } = await call(`${sidecar}/-/cds/deployment/unsubscribe`, 'yves', 'POST', { tenant: 't2' });
    assert.ok(status < 300, `unsubscribe: ${status}`);
    assert.ok(!existsSync(path.join(tmp, 'db-t2.sqlite')));
    assert.ok(existsSync(path.join(tmp, 'db-t1.sqlite')));
  });
});
