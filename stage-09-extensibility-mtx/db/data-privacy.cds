/**
 * What: Data-privacy annotations: supplier contacts are data subjects (natural persons) with
 *     personal fields; suppliers are the related business entity.
 * Why: [CAP-M17] / [CAP-M16] @cap-js/audit-logging reads @PersonalData to write
 *     PersonalDataModified (and SensitiveDataRead) audit logs automatically; the same annotations
 *     feed SAP Personal Data Manager and retention management.
 * If missing or unlinked: Changes to contact e-mails and phone numbers are not audit-logged, and
 *     personal data cannot be found for information or deletion requests.
 */
using { acme.procurement as my } from './schema';

annotate my.SupplierContacts with @PersonalData: {
  EntitySemantics: 'DataSubject',
  DataSubjectRole: 'SupplierContact'
} {
  ID    @PersonalData.FieldSemantics: 'DataSubjectID';
  name  @PersonalData.IsPotentiallyPersonal;
  email @PersonalData.IsPotentiallyPersonal;
  phone @PersonalData.IsPotentiallyPersonal;
};

annotate my.Suppliers with @PersonalData: { EntitySemantics: 'Other' };
