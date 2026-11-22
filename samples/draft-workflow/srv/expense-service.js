/**
 * What: Implementation of ExpenseService: live total of a draft whenever items change, final total
 *     on activation, the submit/approve/reject state machine (409 on invalid transitions) and the
 *     status colour.
 * Why: [CAP-M05] [CAP-M06] the total is stored (sortable) but derived from the items; the UI asks for
 *     it again through side effects (app/expenses/annotations.cds).
 * If missing or unlinked: Totals stay 0, actions answer 501 "not implemented" and the status has no
 *     colour.
 */
const cds = require('@sap/cds');

const TRANSITIONS = {
  submit: { from: 'Draft', to: 'Submitted' },
  approve: { from: 'Submitted', to: 'Approved' },
  reject: { from: 'Submitted', to: 'Rejected' },
};
const CRITICALITY = { Draft: 0, Submitted: 2, Approved: 3, Rejected: 1 };

/** Sum of amounts in cents - no floating-point drift. */
const sum = (items) => items.reduce((s, i) => s + Math.round(Number(i.amount ?? 0) * 100), 0) / 100;

module.exports = class ExpenseService extends cds.ApplicationService {
  init() {
    const { ExpenseReports, ExpenseItems } = this.entities;

    // ---- live total while a draft is edited: remember the parent before UPDATE/DELETE of an item
    const parentOf = new WeakMap();
    this.before(['UPDATE', 'DELETE'], ExpenseItems.drafts, async (req) => {
      const item = await SELECT.one.from(ExpenseItems.drafts).columns('report_ID').where({ ID: req.data.ID });
      if (item) parentOf.set(req, item.report_ID);
    });
    this.after(['NEW', 'UPDATE', 'DELETE'], ExpenseItems.drafts, async (_, req) => {
      const ID = req.data.report_ID ?? parentOf.get(req);
      if (!ID) return;
      const items = await SELECT.from(ExpenseItems.drafts).columns('amount').where({ report_ID: ID });
      await UPDATE(ExpenseReports.drafts).set({ total: sum(items) }).where({ ID });
    });

    // ---- activation: the stored total always matches the saved items
    this.before(['CREATE', 'UPDATE'], ExpenseReports, (req) => {
      if (Array.isArray(req.data.items)) req.data.total = sum(req.data.items);
    });

    // ---- status colour for list and object page
    this.after('READ', [ExpenseReports, ExpenseReports.drafts], (rows) => {
      for (const row of [rows].flat()) if (row?.status) row.statusCriticality = CRITICALITY[row.status];
    });

    // ---- only drafts can be edited: approved or submitted reports are frozen (review S2 - otherwise
    // Edit -> change an amount -> Save changed an approved report)
    this.before('EDIT', ExpenseReports, async (req) => {
      const report = await SELECT.one.from(ExpenseReports).columns('status').where({ ID: req.params?.[0]?.ID ?? req.data.ID });
      if (report && report.status !== 'Draft') return req.reject(409, `The report is ${report.status} and can no longer be edited.`);
    });

    // ---- state machine
    for (const action of Object.keys(TRANSITIONS)) {
      this.on(action, ExpenseReports, (req) => this.transition(action, req));
      this.on(action, ExpenseReports.drafts, (req) => req.reject(409, 'Save the expense report before changing its status.'));
    }
    return super.init();
  }

  async transition(action, req) {
    const { ExpenseReports, ExpenseItems } = this.entities;
    const { ID } = req.params[0];
    const report = await SELECT.one.from(ExpenseReports).columns('status').where({ ID });
    if (!report) return req.reject(404, `Expense report ${ID} does not exist.`);
    const { from, to } = TRANSITIONS[action];
    if (report.status !== from) return req.reject(409, `The report is ${report.status}; "${action}" is only allowed when it is ${from}.`);
    // an open edit draft would overwrite the new status when it is saved (review S1)
    if (await SELECT.one.from(ExpenseReports.drafts).columns('ID').where({ ID })) {
      return req.reject(409, 'The report is being edited. Save or discard the draft first.');
    }
    if (action === 'submit') {
      const { n } = await SELECT.one.from(ExpenseItems).columns('count(1) as n').where({ report_ID: ID });
      if (!n) return req.reject(400, 'Add at least one expense before submitting.', 'items');
    }
    if (action === 'reject' && !req.data.reason?.trim()) return req.reject(400, 'Enter a reason for the rejection.', 'reason');
    // conditional update: a concurrent decision that changed the status first makes this one fail
    const changed = await UPDATE(ExpenseReports).set({ status: to, reason: action === 'reject' ? req.data.reason : null }).where({ ID, status: from });
    if (!changed) return req.reject(409, 'The report was changed concurrently. Reload and try again.');
    return this.run(SELECT.one.from(ExpenseReports).where({ ID, IsActiveEntity: true }));
  }
};
