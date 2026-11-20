<!--
What: Operations runbook for ACME Procurement on SAP BTP Cloud Foundry: one-time setup, build and
    deployment, tenant onboarding and role assignment, smoke tests, upgrades, rollback, monitoring
    and common incidents.
Why: [CAP-STAGE-10] requires docs/runbook.md - the steps an operator follows, in order, without
    needing to read the code.
If missing or unlinked: Every deployment and incident is handled from memory, differently each time.
-->

# Runbook - ACME Procurement on SAP BTP Cloud Foundry

Status: written and checked against the generated `mta.yaml`; the BTP steps were **not executed**
while writing this guide (no BTP access). Commands and service names follow CAP 10 / cds-dk 10.2.

## 1. One-time setup (provider subaccount)

1. Cloud Foundry environment enabled, an org and a space (e.g. `procurement-dev`).
2. SAP HANA Cloud instance created and mapped to the space (or subaccount).
3. Entitlements in the provider subaccount:

   | Service | Plan | Used by |
   |---------|------|---------|
   | Authorization & Trust Management (`xsuaa`) | application | login, roles |
   | Service Manager (`service-manager`) | container | HDI container per tenant |
   | SaaS Provisioning (`saas-registry`) | application | subscriptions |
   | SAP Event Mesh (`enterprise-messaging`) | default | outbox delivery, BP events |
   | Object Store (`objectstore`) | standard | attachments |
   | Malware Scanning (`malware-scanner`) | clamav | attachment scans |
   | Audit Log Service (`auditlog`) | premium | personal-data logs |
   | Destination (`destination`) | lite | S/4HANA destination `S4_BP` |
   | HTML5 Application Repository (`html5-apps-repo`) | app-host, app-runtime | Fiori app |
   | Cloud Logging (`cloud-logging`) | standard | logs, traces, metrics |
   | Cloud Foundry runtime | memory quota ≥ 2 GB | 3 apps + tasks |

4. Destination `S4_BP` (subaccount level) to the S/4HANA system
   (`/sap/opu/odata/sap/API_BUSINESS_PARTNER`), via Cloud Connector for on-premise systems.
5. Tools: `cf` CLI v8+, `cf install-plugin multiapps`, Node.js 22/24, network access for npm.

## 2. Build and deploy

```sh
cd final-app
npm run build:mtar                       # -> mta_archives/acme-procurement_1.0.0.mtar (~2-3 min)
cf login -a https://api.cf.<region>.hana.ondemand.com --sso
cf target -o <org> -s <space>
npm run deploy                           # = cf deploy <mtar> -f (checks cf, plugin, login first)
```

What happens: services are created (first time) → `acme-procurement-srv`, `-mtx`, the
approuter and the HTML5 content are deployed → the hook `upgrade-all` (`cds-mtx upgrade '*'`) runs
as a task **before** the sidecar starts → apps start.

Quotas (from `mta.yaml`): sidecar 256 MB / 512 MB disk, upgrade task 512 MB / 768 MB disk,
approuter 256 MB; the service module uses the CF default (set `memory:` if needed).

## 3. Onboard a customer (tenant)

1. In the **consumer** subaccount: *Service Marketplace* → **ACME Procurement** → *Create*
   subscription. The SaaS registry calls the sidecar (`/-/cds/saas-provisioning/tenant/<id>`), which
   creates and deploys the tenant's HDI container (asynchronous, minutes).
2. Map the route: `cf map-route acme-procurement <cf-domain> --hostname <consumer-subdomain>-<approuter-host>`
   (or a wildcard route), matching `TENANT_HOST_PATTERN`.
3. Assign role collections in the consumer subaccount (*Security* → *Role Collections*):
   `Requester`, `Approver`, `Buyer`, `Admin`, `Auditor`, `ExtensionDeveloper (…)`.
4. Open `https://<consumer-subdomain>-<approuter-host>.cfapps.<region>.hana.ondemand.com`.

## 4. Smoke tests after every deployment

| Check | Expected |
|-------|----------|
| `cf apps` | 3 apps `started`, instances `1/1` |
| `GET https://<srv-route>/health` | `{"status":"UP"}` |
| approuter URL in a browser | login page, then the List Report |
| as Requester: create, add item, save, submit | order `PO-...`, status *Submitted* |
| as Approver: approve | status *Approved*; notification for buyers (`/odata/v4/procurement/Notifications`) |
| upload an attachment | scan status becomes *Clean* |
| `cf logs acme-procurement-mtx --recent` | `upgraded tenant ...` for every tenant, no errors |
| Cloud Logging dashboard | traces of the requests above |

## 5. Upgrade (new version)

Build and deploy as in section 2 - the `upgrade-all` hook upgrades every tenant database before the
new sidecar starts. Prefer zero downtime:

```sh
STRATEGY=blue-green npm run deploy
```

Before deploying model changes: check [schema evolution](../../stage-07-data-persistence/docs/hana-notes.md#4-schema-evolution---data-loss-warning)
(renames/removals drop columns in **all** tenants) and test the upgrade with an extended tenant.

## 6. Rollback

| Situation | Action |
|-----------|--------|
| blue-green deployment, new version faulty before switch | abort: `cf deploy -i <operation-id> -a abort` |
| new version live, code bug, no schema change | redeploy the previous `.mtar` (keep archives of released versions) |
| schema already upgraded | redeploy the previous `.mtar` **only if** the change was additive; otherwise restore tenant containers from SAP HANA Cloud backup (point-in-time recovery) |
| one tenant failed to upgrade | fix, then `POST /-/cds/saas-provisioning/upgrade {"tenants":["<id>"]}` on the sidecar (technical user) |

## 7. Monitoring

- Logs: `cf logs <app> --recent`; structured logs and traces in SAP Cloud Logging (OpenSearch
  dashboards) via `@cap-js/telemetry` (`to-cloud-logging`).
- Health: `/health` of the service module (excluded from tracing).
- Outbox: rows in `cds.outbox.Messages` that stay - delivery failing (Event Mesh down / consumer
  error); they are retried up to 10 times.
- Audit logs: SAP Audit Log Viewer (personal-data changes of supplier contacts).

## 8. Incidents

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| login loop / 401 at the approuter | redirect URI or route does not match `TENANT_HOST_PATTERN` | check routes (`cf routes`) and `oauth2-configuration.redirect-uris` |
| 403 for all users of a tenant | role collections not assigned in the consumer subaccount | assign them (section 3) |
| subscription stuck "in process" | sidecar job failed / quota | `cf logs acme-procurement-mtx --recent`; increase memory of the sidecar |
| `RemoteSuppliers` 502 | destination `S4_BP` or Cloud Connector | check destination, connectivity, credentials |
| attachments stay *Unscanned* | malware scanner binding / outbox | check `malware-scanner` binding, outbox rows |
| deployment fails at `upgrade-all` | incompatible model change for a tenant (extension) | read the task log, fix model or extension, redeploy |
