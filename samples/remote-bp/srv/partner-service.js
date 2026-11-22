/**
 * What: Implementation of PartnerService: delegates RemotePartners reads to the Business Partner
 *     API (502 when it fails), replicates partners idempotently into the local Partners table, and
 *     replicates on S/4HANA business-partner events.
 * Why: [CAP-M08] / [CAP-DEC-05] the two integration styles in one place; events arrive at least
 *     once and possibly out of order, so replication compares LastChangeDate with the local copy.
 * If missing or unlinked: RemotePartners returns nothing (no handler for an entity without a
 *     table), and replicate / replicateAll answer 501.
 */
const cds = require('@sap/cds');

const LOG = cds.log('partners');
/** S/4HANA business event for changed partners (SAP Business Accelerator Hub name). */
const BP_CHANGED = 'sap.s4.beh.businesspartner.v1.BusinessPartner.Changed.v1';

module.exports = class PartnerService extends cds.ApplicationService {
  async init() {
    const { RemotePartners } = this.entities;
    const bp = await cds.connect.to('API_BUSINESS_PARTNER');

    // ---- delegation: forward the (already translated) query, hide remote error details
    this.on('READ', RemotePartners, async (req) => {
      try {
        return await bp.run(req.query);
      } catch (err) {
        LOG.error('Business Partner API call failed', err);
        return req.reject(502, 'The S/4HANA business partner service is not available.');
      }
    });

    // ---- replication
    this.on('replicate', (req) => this.replicatePartner(bp, req.data.bpNumber));
    this.on('replicateAll', async () => {
      const partners = await bp.run(SELECT.from(bp.entities.A_BusinessPartner).columns('BusinessPartner'));
      const result = { created: 0, updated: 0, unchanged: 0 };
      for (const { BusinessPartner } of partners) {
        const outcome = await this.replicatePartner(bp, BusinessPartner);
        if (outcome in result) result[outcome]++;
      }
      return result;
    });

    // ---- event-driven replication (Event Mesh in production, local messaging here)
    const messaging = await cds.connect.to('messaging');
    // (the payload is untrusted: only a well-formed partner number is used, and the data is re-read)
    messaging.on(BP_CHANGED, (msg) => {
      const bpNumber = msg.data?.BusinessPartner;
      if (!/^\d{1,10}$/.test(bpNumber ?? '')) return LOG.warn('invalid business partner event ignored');
      return this.replicatePartner(bp, bpNumber);
    });

    return super.init();
  }

  /**
   * Creates or updates the local copy of one partner - only if S/4HANA has newer data.
   * @returns {Promise<'created'|'updated'|'unchanged'|'unknown'>}
   */
  async replicatePartner(bp, bpNumber) {
    const { A_BusinessPartner, A_BusinessPartnerAddress } = bp.entities;
    const partner = await bp.run(
      SELECT.one.from(A_BusinessPartner)
        .columns('BusinessPartnerFullName', 'BusinessPartnerIsBlocked', 'LastChangeDate')
        .where({ BusinessPartner: bpNumber }),
    );
    if (!partner) return 'unknown';

    const { Partners } = cds.entities('sample.remotebp');
    const local = await SELECT.one.from(Partners).columns('name', 'blocked', 'country', 'lastChanged').where({ bpNumber });
    // stale event: S/4HANA older than the local copy. LastChangeDate has day precision - on the same
    // day re-read and compare instead of skipping, or a block set later that day never arrives.
    if (local?.lastChanged && local.lastChanged > partner.LastChangeDate) return 'unchanged';

    const address = await bp.run(SELECT.one.from(A_BusinessPartnerAddress).columns('Country').where({ BusinessPartner: bpNumber }));
    const data = {
      name: partner.BusinessPartnerFullName,
      blocked: !!partner.BusinessPartnerIsBlocked,
      country: address?.Country ?? null,
      lastChanged: partner.LastChangeDate,
    };
    if (local) {
      if (local.name === data.name && !!local.blocked === data.blocked && local.country === data.country) {
        if (local.lastChanged !== data.lastChanged) await UPDATE(Partners, bpNumber).with({ lastChanged: data.lastChanged });
        return 'unchanged'; // duplicate event / repeated full load
      }
      await UPDATE(Partners, bpNumber).with(data);
      return 'updated';
    }
    await INSERT.into(Partners).entries({ bpNumber, ...data });
    return 'created';
  }
};
