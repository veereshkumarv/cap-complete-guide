/**
 * What: Formatter functions of the custom Budget section: percentage used, value state
 *     (Success < 90 % <= Warning <= 100 % < Error), progress label and remaining amount.
 * Why: [CAP-M10] presentation logic for a custom fragment belongs in a small, testable module that
 *     the fragment loads with core:require - no controller needed (unit-tested in test/extensions.test.js).
 * If missing or unlinked: The Budget section fails to load ("failed to load .../BudgetFormatter.js").
 */
sap.ui.define([], function () {
  'use strict';

  function ratio(spent, budget) {
    const b = Number(budget);
    return b > 0 ? Number(spent || 0) / b : 0;
  }

  return {
    /** 0..100 for sap.m.ProgressIndicator#percentValue (capped at 100). */
    percent: function (spent, budget) {
      return Math.min(100, Math.round(ratio(spent, budget) * 100));
    },
    /** sap.ui.core.ValueState name. */
    state: function (spent, budget) {
      const r = ratio(spent, budget);
      if (r > 1) return 'Error';
      return r >= 0.9 ? 'Warning' : 'Success';
    },
    label: function (spent, budget) {
      return Math.round(ratio(spent, budget) * 100) + ' % of budget used';
    },
    remaining: function (spent, budget, currency) {
      const rest = Math.round((Number(budget || 0) - Number(spent || 0)) * 100) / 100;
      const amount = Math.abs(rest).toFixed(2) + ' ' + (currency || '');
      return rest >= 0 ? amount + ' left' : amount + ' over budget';
    },
  };
});
