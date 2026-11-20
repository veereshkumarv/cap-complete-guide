/**
 * What: Entry point of the app/ model - pulls in the annotations of the expenses Fiori app.
 * Why: [CAP-M09] CAP loads app/services.cds with db/ and srv/; annotations end up in $metadata.
 * If missing or unlinked: The app shows empty tables and pages without columns, facets or buttons.
 */
using from './expenses/annotations';
