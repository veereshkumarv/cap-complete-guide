/**
 * What: Replication of one S/4HANA business partner into acme.procurement.Suppliers: reads the
 *     partner and its address from API_BUSINESS_PARTNER and creates or updates the local supplier
 *     (name, country, central block).
 * Why: [CAP-M08] / [CAP-DEC-05] replicate when data is joined, sorted or validated locally. Events
 *     arrive at least once and possibly out of order, so the function is idempotent: a partner that
 *     is not newer than the local copy (LastChangeDate) is left alone.
 * If missing or unlinked: IntegrationService has no replication logic - suppliers never learn about
 *     new partners or blocks in S/4HANA.
 */
const cds = require('@sap/cds');

const LOG = cds.log('replication');

/**
 * @param {string} bpNumber S/4HANA business partner number
 * @returns {Promise<'created'|'updated'|'unchanged'|'unknown'>}
 */
async function replicateBusinessPartner(bpNumber) {
  const bp = await cds.connect.to('API_BUSINESS_PARTNER');
  const { A_BusinessPartner, A_BusinessPartnerAddress } = bp.entities;
  const partner = await bp.run(
    SELECT.one.from(A_BusinessPartner)
      .columns('BusinessPartner', 'BusinessPartnerFullName', 'BusinessPartnerIsBlocked', 'LastChangeDate')
      .where({ BusinessPartner: bpNumber }),
  );
  if (!partner) {
    LOG.warn('business partner not found in S/4HANA', { bpNumber });
    return 'unknown';
  }

  const { Suppliers } = cds.entities('acme.procurement');
  const local = await SELECT.one.from(Suppliers).columns('ID', 'name', 'blocked', 'country_code', 'bpLastChanged').where({ bpNumber });
  // Out-of-order event: S/4HANA data older than the local copy. LastChangeDate has day precision,
  // so on the SAME day we cannot tell - re-read and compare the content instead of skipping
  // (otherwise a block set later that day would never arrive; S/4 review H1).
  if (local?.bpLastChanged && local.bpLastChanged > partner.LastChangeDate) return 'unchanged';

  const address = await bp.run(SELECT.one.from(A_BusinessPartnerAddress).columns('Country').where({ BusinessPartner: bpNumber }));
  const data = {
    name: partner.BusinessPartnerFullName,
    blocked: !!partner.BusinessPartnerIsBlocked,
    country_code: address?.Country ?? null,
    bpLastChanged: partner.LastChangeDate,
  };
  if (local) {
    const same = local.name === data.name && !!local.blocked === data.blocked && local.country_code === data.country_code;
    if (same) {
      if (local.bpLastChanged !== data.bpLastChanged) await UPDATE(Suppliers, local.ID).with({ bpLastChanged: data.bpLastChanged });
      return 'unchanged'; // duplicate event / repeated full load
    }
    await UPDATE(Suppliers, local.ID).with(data);
    LOG.info('supplier updated from S/4HANA', { bpNumber, blocked: data.blocked });
    return 'updated';
  }
  await INSERT.into(Suppliers).entries({ bpNumber, ...data });
  LOG.info('supplier created from S/4HANA', { bpNumber });
  return 'created';
}

module.exports = { replicateBusinessPartner };
