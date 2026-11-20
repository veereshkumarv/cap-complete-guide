/**
 * What: Controller extension of the Projects Object Page: before a draft is saved, it asks for
 *     confirmation when the spent amount exceeds the budget; cancelling keeps the draft open.
 * Why: [CAP-M10] the last resort before freestyle - hooks into Fiori Elements' edit flow
 *     (editFlow.onBeforeSave) instead of replacing it. It is a UX warning only; hard rules belong
 *     in the service (CAP-DEC-02).
 * If missing or unlinked: The manifest's controllerExtensions entry points nowhere and the Object
 *     Page fails to load; without the entry the page saves without the warning.
 */
sap.ui.define(['sap/ui/core/mvc/ControllerExtension', 'sap/m/MessageBox'], function (ControllerExtension, MessageBox) {
  'use strict';

  return ControllerExtension.extend('sample.projects.ext.controller.ObjectPageExt', {
    override: {
      editFlow: {
        /** Rejecting the promise cancels the save. */
        onBeforeSave: function () {
          const view = this.base.getView();
          const ctx = view.getBindingContext();
          const budget = Number(ctx.getProperty('budget'));
          const spent = Number(ctx.getProperty('spent'));
          if (!(budget > 0 && spent > budget)) return Promise.resolve();
          const i18n = view.getModel('i18n').getResourceBundle();
          return new Promise(function (resolve, reject) {
            MessageBox.confirm(i18n.getText('overBudgetConfirm', [spent.toFixed(2), budget.toFixed(2)]), {
              title: i18n.getText('overBudgetTitle'),
              onClose: function (action) { return action === MessageBox.Action.OK ? resolve() : reject(); },
            });
          });
        },
      },
    },
  });
});
