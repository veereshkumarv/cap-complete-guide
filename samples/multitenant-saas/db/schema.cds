/**
 * What: Domain model of the multitenant sample - one entity, Notes.
 * Why: [CAP-M20] the model is deliberately trivial so the sample shows only multitenancy: every
 *     tenant gets its own table (own database), deployed by the sidecar at subscription.
 * If missing or unlinked: The service has nothing to expose and subscriptions deploy an empty schema.
 */
using { cuid, managed } from '@sap/cds/common';

namespace sample.saas;

entity Notes : cuid, managed {
  text : String(255) @mandatory;
}
