/**
 * What: Local copy of S/4HANA business partners (replicated, not entered by users).
 * Why: [CAP-M08] / [CAP-DEC-05] replicated data can be joined, sorted, filtered and validated
 *     locally and is available when S/4HANA is down; lastChanged makes replication idempotent.
 * If missing or unlinked: srv/partner-service.cds cannot project Partners and replication has
 *     nowhere to write.
 */
namespace sample.remotebp;

entity Partners {
  key bpNumber    : String(10);
      name        : String(81);
      country     : String(3);
      blocked     : Boolean default false;
      /** LastChangeDate of the partner in S/4HANA at the time of replication. */
      lastChanged : Date;
      replicatedAt: Timestamp @cds.on.insert: $now @cds.on.update: $now;
}
