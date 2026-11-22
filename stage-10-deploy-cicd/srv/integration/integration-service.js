/**
 * What: Implementation of IntegrationService: subscribes to S/4HANA business partner events and to
 *     the "purchase order approved" message, and implements the replication actions.
 * Why: [CAP-M07] [CAP-M08] [CAP-STAGE-08] wires messaging topics to the idempotent handlers in this
 *     folder; the same replication code serves events (one partner) and the full load (all partners).
 * If missing or unlinked: The @impl in srv/integration-service.cds points nowhere - CAP fails to
 *     start the service, no message is consumed, and replicateSuppliers answers 501.
 */
const cds = require('@sap/cds');
const { replicateBusinessPartner } = require('./bp-replication');
const { ORDER_APPROVED, onOrderApproved } = require('./approval-notifications');

const LOG = cds.log('replication');

const PAGE = 500;

/** S/4HANA business events for business partners (SAP Business Accelerator Hub names). */
const BP_EVENTS = [
  'sap.s4.beh.businesspartner.v1.BusinessPartner.Created.v1',
  'sap.s4.beh.businesspartner.v1.BusinessPartner.Changed.v1',
];

module.exports = class IntegrationService extends cds.ApplicationService {
  async init() {
    this.on('replicateBusinessPartner', (req) => replicateBusinessPartner(req.data.bpNumber));

    // Full load in pages; organisations only (category 2) - persons are personal data we do not
    // need (S/4 review M1/M5). For large systems run it as a background job (see guardrails).
    this.on('replicateAll', async () => {
      const bp = await cds.connect.to('API_BUSINESS_PARTNER');
      const { A_BusinessPartner } = bp.entities;
      const result = { created: 0, updated: 0, unchanged: 0 };
      for (let offset = 0; ; offset += PAGE) {
        const page = await bp.run(SELECT.from(A_BusinessPartner).columns('BusinessPartner')
          .where({ BusinessPartnerCategory: '2' }).orderBy('BusinessPartner').limit(PAGE, offset));
        for (const { BusinessPartner } of page) {
          const outcome = await replicateBusinessPartner(BusinessPartner);
          if (outcome in result) result[outcome]++;
        }
        if (page.length < PAGE) return result;
      }
    });

    const messaging = await cds.connect.to('messaging');
    for (const topic of BP_EVENTS) {
      messaging.on(topic, (msg) => {
        const bpNumber = msg.data?.BusinessPartner;
        if (!/^\d{1,10}$/.test(bpNumber ?? '')) return LOG.warn('invalid business partner event ignored'); // untrusted payload
        return this.send('replicateBusinessPartner', { bpNumber });
      });
    }
    messaging.on(ORDER_APPROVED, onOrderApproved);

    return super.init();
  }
};
