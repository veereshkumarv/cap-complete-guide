/**
 * What: Static checks of the deployment setup: mta.yaml modules, services and hooks, the effective
 *     production configuration, the production build output used by the MTA modules, approuter
 *     routes, role collections, and the CI/CD workflows.
 * Why: [CAP-STAGE-10] / [CAP-M22] [CAP-M23] - a real `cf deploy` needs BTP, but most deployment
 *     failures are configuration mistakes (missing binding, wrong path, missing lock file, wrong
 *     route order) that can be caught on every laptop and in CI in a few seconds.
 * If missing or unlinked: A broken mta.yaml or build output is found only by a failed deployment.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');

const root = path.join(__dirname, '..');
const mta = YAML.parse(readFileSync(path.join(root, 'mta.yaml'), 'utf8'));
const mtaModule = (suffix) => mta.modules.find((m) => m.name === `acme-procurement${suffix}`);
const resource = (suffix) => mta.resources.find((r) => r.name === `acme-procurement${suffix}`);
const json = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

describe('mta.yaml (stage 10)', () => {
  it('deploys service, MTX sidecar, approuter, app deployer and the Fiori app', () => {
    assert.deepEqual(
      Object.fromEntries(mta.modules.map((m) => [m.name, m.type])),
      {
        'acme-procurement-srv': 'nodejs',
        'acme-procurement-mtx': 'nodejs',
        'acme-procurement': 'approuter.nodejs',
        'acme-procurement-app-deployer': 'com.sap.application.content',
        acmeprocurementprocurement: 'html5',
      },
    );
  });

  it('creates every BTP service the production configuration needs', () => {
    const services = Object.fromEntries(mta.resources.map((r) => [r.parameters.service, r.parameters['service-plan']]));
    assert.deepEqual(services, {
      xsuaa: 'application', // auth.kind xsuaa
      'service-manager': 'container', // one HDI container per tenant
      'saas-registry': 'application', // subscriptions
      'enterprise-messaging': 'default', // messaging (outbox delivery)
      objectstore: 'standard', // attachments
      'malware-scanner': 'clamav', // attachment scanning
      auditlog: 'premium', // audit-logging
      destination: 'lite', // S/4HANA destination S4_BP
      'html5-apps-repo': 'app-runtime', // last one wins - both plans are checked below
      'cloud-logging': 'standard', // telemetry
    });
    assert.equal(resource('-html5-repo-host').parameters['service-plan'], 'app-host');
  });

  it('binds the service module to everything it uses at runtime', () => {
    const requires = mtaModule('-srv').requires.map((r) => r.name.replace('acme-procurement-', ''));
    for (const name of ['auth', 'db', 'messaging', 'attachments', 'destination', 'auditlog', 'malware-scanner', 'cloud-logging']) {
      assert.ok(requires.includes(name), `srv requires ${name}`);
    }
  });

  it('upgrades all tenants before the new sidecar starts', () => {
    const hook = mtaModule('-mtx').hooks.find((h) => h.name === 'upgrade-all');
    assert.equal(hook.parameters.command, "cds-mtx upgrade '*'");
    assert.ok(hook.phases.includes('deploy.application.before-start'));
    assert.ok(hook.phases.includes('blue-green.application.before-start.idle'));
  });

  it('routes tenants by host name and builds the Fiori app with UI5 tooling', () => {
    assert.equal(mtaModule('').properties.TENANT_HOST_PATTERN, '^(.*)-${default-uri}');
    const html5 = mta.modules.find((m) => m.type === 'html5');
    assert.deepEqual(html5['build-parameters'].commands, ['npm ci', 'npm run build']);
    assert.equal(html5['build-parameters']['build-result'], 'dist');
    assert.ok(existsSync(path.join(root, 'app/procurement/package-lock.json')), 'npm ci needs a lock file');
  });

  it('offers one role collection per role template of xs-security.json', () => {
    const templates = json('xs-security.json')['role-templates'].map((t) => `$XSAPPNAME.${t.name}`).sort();
    const collections = resource('-auth').parameters.config['role-collections'].flatMap((c) => c['role-template-references']).sort();
    assert.deepEqual(collections, templates);
  });
});

describe('Production configuration and build (stage 10)', () => {
  let target;
  before(() => {
    // own build target: test/persistence.test.js builds into gen/ in parallel
    target = mkdtempSync(path.join(os.tmpdir(), 'procurement-build-'));
    execFileSync('npx', ['cds', 'build', '--production'], { cwd: root, env: { ...process.env, CDS_BUILD_TARGET: target }, encoding: 'utf8' });
  });
  after(() => rmSync(target, { recursive: true, force: true }));

  it('uses the BTP services in the production profile', () => {
    const out = execFileSync('npx', ['cds', 'env', 'requires', '--profile', 'production'], { cwd: root, encoding: 'utf8' });
    const r = JSON.parse(out);
    assert.equal(r.auth.kind, 'xsuaa');
    assert.equal(r.db.kind, 'hana');
    assert.ok(r.multitenancy);
    assert.equal(r.messaging.kind, 'enterprise-messaging-http');
    assert.equal(r.attachments.kind, 'standard');
    assert.equal(r['audit-log'].kind, 'audit-log-to-restv2');
    // `cds add cloud-logging` writes the short kind name; what counts is the resolved exporter + binding
    assert.equal(r.telemetry.tracing.exporter.module, '@opentelemetry/exporter-trace-otlp-grpc');
    assert.ok([r.telemetry.vcap].flat().some((v) => v.label === 'cloud-logging'), 'bound to the Cloud Logging service');
  });

  it('produces the folders the MTA modules point to - with lock files for npm ci', () => {
    for (const m of mta.modules.filter((x) => x.path.startsWith('gen/') && x.type === 'nodejs')) {
      const dir = path.join(target, m.path.slice('gen/'.length));
      assert.ok(existsSync(path.join(dir, 'package.json')), `${m.path}/package.json`);
      assert.ok(existsSync(path.join(dir, 'package-lock.json')) || m.name.endsWith('-srv'), `${m.path}/package-lock.json`);
    }
    assert.ok(existsSync(path.join(target, 'mtx/sidecar/_main')), 'sidecar contains the app model');
  });
});

describe('Approuter and CI/CD (stage 10)', () => {
  it('routes MTX, OData and the HTML5 repository in this order', () => {
    const xsApp = json('.deploy/app-router/xs-app.json');
    assert.deepEqual(xsApp.routes.map((r) => r.destination ?? r.service), ['mtx-api', 'srv-api', 'html5-apps-repo-rt']);
    const appId = json('app/procurement/webapp/manifest.json')['sap.app'].id.replace(/\./g, '');
    assert.equal(xsApp.welcomeFile, `/${appId}/index.html`);
  });

  it('gates releases on tests and uses local reusable workflows', () => {
    const release = YAML.parse(readFileSync(path.join(root, '.github/workflows/release.yaml'), 'utf8'));
    assert.equal(release.jobs.tests.uses, './.github/workflows/test.yaml');
    assert.deepEqual(release.jobs['deploy-cf'].needs, ['tests']);
    const testRuns = YAML.parse(readFileSync(path.join(root, '.github/workflows/test.yaml'), 'utf8')).jobs.tests.steps.map((s) => s.run).filter(Boolean);
    assert.ok(testRuns.includes('npm test'));
    assert.ok(testRuns.includes('npx cds lint .'));
  });
});
