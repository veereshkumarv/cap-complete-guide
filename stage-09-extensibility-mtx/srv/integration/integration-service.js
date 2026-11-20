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

/** S/4HANA business events for business partners (SAP Business Accelerator Hub names). */
const BP_EVENTS = [
  'sap.s4.beh.businesspartner.v1.BusinessPartner.Created.v1',
  'sap.s4.beh.businesspartner.v1.BusinessPartner.Changed.v1',
];

module.exports = class IntegrationService extends cds.ApplicationService {
  async init() {
    this.on('replicateBusinessPartner', (req) => replicateBusinessPartner(req.data.bpNumber));

    this.on('replicateAll', async () => {
      const bp = await cds.connect.to('API_BUSINESS_PARTNER');
      const partners = await bp.run(SELECT.from(bp.entities.A_BusinessPartner).columns('BusinessPartner'));
      const result = { created: 0, updated: 0, unchanged: 0 };
      for (const { BusinessPartner } of partners) {
        const outcome = await replicateBusinessPartner(BusinessPartner);
        if (outcome in result) result[outcome]++;
      }
      return result;
    });

    const messaging = await cds.connect.to('messaging');
    for (const topic of BP_EVENTS) {
      messaging.on(topic, (msg) => this.send('replicateBusinessPartner', { bpNumber: msg.data.BusinessPartner }));
    }
    messaging.on(ORDER_APPROVED, onOrderApproved);

    return super.init();
  }
};
