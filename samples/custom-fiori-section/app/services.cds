/**
 * What: Entry point of the app/ model - pulls in the annotations of the projects app.
 * Why: [CAP-M09] CAP loads app/services.cds with db/ and srv/; annotations end up in $metadata.
 * If missing or unlinked: The app shows no columns, facets or labels.
 */
using from './projects/annotations';
