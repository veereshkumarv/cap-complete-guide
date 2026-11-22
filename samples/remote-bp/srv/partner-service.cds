/**
 * What: PartnerService - the two ways to use remote data: RemotePartners (live delegation to the
 *     S/4HANA Business Partner API per request) and Partners (local replicated copy), plus the
 *     replication actions.
 * Why: [CAP-M08] / [CAP-DEC-05] shows delegate vs. replicate side by side on the same API.
 * If missing or unlinked: The sample exposes no endpoints; srv/partner-service.js has nothing to
 *     implement.
 */
using { sample.remotebp as db } from '../db/schema';
using { API_BUSINESS_PARTNER as bp } from './external/API_BUSINESS_PARTNER';

// Every call reaches S/4HANA or writes data: login required, replication for admins only, small
// pages for remote reads (S/4 review M6/M4).
service PartnerService @(path: '/odata/v4/partners', requires: 'authenticated-user') {
  /** Live: every read is forwarded to S/4HANA (mocked in development). */
  @readonly @cds.query.limit: { default: 20, max: 50 } entity RemotePartners as projection on bp.A_BusinessPartner {
    key BusinessPartner          as ID,
        BusinessPartnerFullName  as name,
        Industry                 as industry,
        BusinessPartnerIsBlocked as blocked,
        LastChangeDate           as lastChanged
  };

  /** Replicated: filled by replicate / replicateAll and by business-partner events. */
  @readonly entity Partners as projection on db.Partners;

  /** Replicates one partner. Idempotent - returns created | updated | unchanged | unknown. */
  @(requires: 'admin') action replicate(bpNumber : String(10)) returns String;

  /** Replicates all partners (initial load / nightly job). */
  @(requires: 'admin') action replicateAll() returns {
    created   : Integer;
    updated   : Integer;
    unchanged : Integer;
  };
}
