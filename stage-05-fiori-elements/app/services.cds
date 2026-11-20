/**
 * What: Entry point of the app/ model - pulls in the annotations of every Fiori app.
 * Why: [CAP-M09] CAP loads app/services.cds with db/ and srv/; annotations stay in CDS (not in
 *     manifest.json or XML) so they are compiled into the service $metadata.
 * If missing or unlinked: The Fiori app starts but shows empty tables and pages - no columns,
 *     filters, facets, value helps or action buttons.
 */
using from './procurement/annotations';
