/**
 * What: IntegrationService - internal service (no HTTP endpoint) that replicates S/4HANA business
 *     partners into local suppliers and consumes the "purchase order approved" message.
 * Why: [CAP-M08] [CAP-M07] [CAP-M18] / [CAP-DEC-05] - replication keeps a local copy for joins,
 *     value helps and validation (blocked suppliers); event-driven integration code lives in its own
 *     service instead of inside the UI-facing ProcurementService.
 * If missing or unlinked: Business partner events from S/4HANA are ignored, AdminService
 *     replicateSuppliers fails, and approved-order messages pile up without a consumer.
 */
@protocol: 'none'
@impl: 'srv/integration/integration-service.js'
service IntegrationService {
  /** Replicates one business partner. Idempotent: repeating it changes nothing. */
  action replicateBusinessPartner(bpNumber : String(10)) returns String; // created | updated | unchanged | unknown

  /** Replicates every business partner of the S/4HANA system (initial load, nightly job). */
  action replicateAll() returns {
    created   : Integer;
    updated   : Integer;
    unchanged : Integer;
  };
}
