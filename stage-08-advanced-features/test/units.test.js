/**
 * What: Unit tests of the pure helpers in srv/lib: the status state machine, the item sum and the
 *     per-user edit permission hint (stage 06).
 * Why: [CAP-M24] the fastest layer of the test pyramid - business rules without a server.
 * If missing or unlinked: Rule changes are only caught by slower HTTP tests (or not at all).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { nextStatus, allowedActions, TRANSITIONS } = require('../srv/lib/status');
const { sumItems } = require('../srv/lib/totals');
const { canEdit } = require('../srv/lib/permissions');

describe('status state machine', () => {
  it('allows exactly the documented transitions', () => {
    assert.equal(nextStatus('submit', 'Draft'), 'Submitted');
    assert.equal(nextStatus('approve', 'Submitted'), 'Approved');
    assert.equal(nextStatus('reject', 'Submitted'), 'Rejected');
    assert.equal(nextStatus('send', 'Approved'), 'SentToSupplier');
    assert.equal(nextStatus('reopen', 'Rejected'), 'Draft');
  });

  it('refuses everything else', () => {
    const statuses = ['Draft', 'Submitted', 'Approved', 'Rejected', 'SentToSupplier'];
    let allowed = 0;
    for (const a of Object.keys(TRANSITIONS)) for (const s of statuses) if (nextStatus(a, s)) allowed++;
    assert.equal(allowed, 5);
    assert.equal(nextStatus('delete', 'Draft'), undefined);
    assert.deepEqual(allowedActions('SentToSupplier'), []);
    assert.deepEqual(allowedActions('Submitted'), ['approve', 'reject']);
  });
});

describe('sumItems', () => {
  it('sums quantity x price without floating-point drift', () => {
    assert.equal(sumItems([{ quantity: 3, netPrice: '0.1' }, { quantity: 1, netPrice: 0.2 }]), 0.5);
    assert.equal(sumItems([{ quantity: 4, netPrice: '189.90' }, { quantity: 1, netPrice: '549.00' }]), 1308.6);
    assert.equal(sumItems([]), 0);
    assert.equal(sumItems([{ quantity: 2 }]), 0);
  });
});

describe('canEdit (UI hint, mirrors srv/authorizations.cds)', () => {
  const user = (id, ...roles) => ({ id, is: (role) => roles.includes(role) });
  it('lets the owning requester edit only drafts', () => {
    assert.equal(canEdit(user('alice', 'Requester'), { createdBy: 'alice', status: 'Draft' }), true);
    assert.equal(canEdit(user('alice', 'Requester'), { createdBy: 'alice', status: 'Submitted' }), false);
    assert.equal(canEdit(user('fred', 'Requester'), { createdBy: 'alice', status: 'Draft' }), false);
  });

  it('lets admins edit everything and nobody else anything', () => {
    assert.equal(canEdit(user('dave', 'Admin'), { createdBy: 'alice', status: 'Approved' }), true);
    for (const role of ['Approver', 'Buyer', 'Auditor']) {
      assert.equal(canEdit(user('x', role), { createdBy: 'x', status: 'Draft' }), false, role);
    }
  });
});
