/**
 * What: NumberRanges - one row per numbered business object holding the last number issued.
 * Why: [CAP-M05] the guide's `PO-${Date.now()}` is a placeholder; a counter row updated inside the
 *     request transaction gives gap-free, readable, collision-free order numbers.
 * If missing or unlinked: srv/lib/number-range.js cannot draw numbers and creating a purchase
 *     order draft fails.
 */
namespace acme.procurement;

entity NumberRanges {
  key object  : String(30);
      prefix  : String(5);
      current : Integer64 not null default 0;
}
