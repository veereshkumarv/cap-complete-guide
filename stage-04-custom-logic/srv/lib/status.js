/**
 * What: The purchase-order state machine: which action moves an order from which status to which.
 * Why: [CAP-M06] / [CAP-DEC-03] status changes only happen through actions; keeping the rules in one
 *     table makes them testable without HTTP and keeps handlers short.
 * If missing or unlinked: The action handlers cannot decide transitions and every action fails.
 */
const TRANSITIONS = Object.freeze({
  submit: { from: ['Draft'], to: 'Submitted' },
  approve: { from: ['Submitted'], to: 'Approved' },
  reject: { from: ['Submitted'], to: 'Rejected' },
  send: { from: ['Approved'], to: 'SentToSupplier' },
  reopen: { from: ['Rejected'], to: 'Draft' },
});

/**
 * Target status of `action` for an order in `status`, or undefined when not allowed.
 * @param {string} action
 * @param {string} status
 * @returns {string | undefined}
 */
function nextStatus(action, status) {
  const t = TRANSITIONS[action];
  return t && t.from.includes(status) ? t.to : undefined;
}

/** Actions allowed in a status (drives button enablement in stage 05). */
function allowedActions(status) {
  return Object.keys(TRANSITIONS).filter((a) => TRANSITIONS[a].from.includes(status));
}

module.exports = { TRANSITIONS, nextStatus, allowedActions };
