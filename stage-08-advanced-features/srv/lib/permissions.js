/**
 * What: UI permission hints per user and purchase order - may this user edit or delete the order?
 *     Mirrors the @restrict rules for UPDATE/DELETE in srv/authorizations.cds.
 * Why: [CAP-M11] / [CAP-M09] Fiori Elements does not read @restrict; without a hint it shows Edit and
 *     Delete to everybody and the click ends in 403. The hint only hides buttons - enforcement stays
 *     declarative in authorizations.cds.
 * If missing or unlinked: canEdit stays null, so UI.UpdateHidden / UI.DeleteHidden hide Edit and
 *     Delete for every user, including the owner.
 */

/**
 * @param {{ is: (role: string) => boolean, id: string }} user
 * @param {{ createdBy?: string, status?: string }} po
 * @returns {boolean}
 */
function canEdit(user, po) {
  if (user.is('Admin')) return true;
  return user.is('Requester') && po.createdBy === user.id && po.status === 'Draft';
}

module.exports = { canEdit };
