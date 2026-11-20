/**
 * What: Implementation of AdminService: the replicateSuppliers action delegates the full
 *     S/4HANA business partner load to the internal IntegrationService.
 * Why: [CAP-M08] / [CAP-STAGE-08] administrators trigger an initial load or re-sync on demand; the
 *     replication logic stays in one place (srv/integration) for events and full loads.
 * If missing or unlinked: CRUD on master data keeps working, but replicateSuppliers answers
 *     501 "not implemented".
 */
const cds = require('@sap/cds');

const LOG = cds.log('replication');

module.exports = class AdminService extends cds.ApplicationService {
  init() {
    this.on('replicateSuppliers', async (req) => {
      const integration = await cds.connect.to('IntegrationService');
      try {
        return await integration.send('replicateAll');
      } catch (err) {
        // never leak remote or SQL details to the client; the log has them
        LOG.error('replication from S/4HANA failed', err);
        return req.reject({ status: 502, message: 'REMOTE_UNAVAILABLE' });
      }
    });
    return super.init();
  }
};
