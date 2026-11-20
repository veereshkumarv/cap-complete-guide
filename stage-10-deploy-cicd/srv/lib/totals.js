/**
 * What: Order total helpers - sum of quantity x net price for a list of items, and recalculation of
 *     a stored order total from its (draft or active) items.
 * Why: [CAP-M05] totalAmount is stored (sortable, filterable) but derived; one helper keeps the
 *     rounding identical for drafts, activation and tests.
 * If missing or unlinked: Order totals stay empty or stale after items change.
 */

/** @param {Array<{ quantity?: number, netPrice?: number|string }>} items */
function sumItems(items = []) {
  const cents = items.reduce((sum, i) => sum + Math.round(Number(i.quantity ?? 0) * Number(i.netPrice ?? 0) * 100), 0);
  return cents / 100;
}

/**
 * Recomputes totalAmount of one order from its items.
 * @param {any} orders  PurchaseOrders or PurchaseOrders.drafts
 * @param {any} items   PurchaseOrderItems or PurchaseOrderItems.drafts
 * @param {string} ID   order ID
 */
async function recalculate(orders, items, ID) {
  const rows = await SELECT.from(items).columns('quantity', 'netPrice').where({ parent_ID: ID });
  const totalAmount = sumItems(rows);
  await UPDATE(orders).set({ totalAmount }).where({ ID });
  return totalAmount;
}

module.exports = { sumItems, recalculate };
