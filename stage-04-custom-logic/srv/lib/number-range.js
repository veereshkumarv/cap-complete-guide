/**
 * What: Draws the next number of a number range (e.g. PO-1000005) from the NumberRanges table.
 * Why: [CAP-M05] readable, gap-free business numbers. The UPDATE ... SET current = current + 1 runs
 *     inside the request transaction, so the row lock serialises concurrent requests and a
 *     rollback also returns the number.
 * If missing or unlinked: New purchase-order drafts get no order number (the NEW handler fails).
 */
const cds = require('@sap/cds');

/**
 * @param {string} object  key in NumberRanges, e.g. 'PurchaseOrder'
 * @returns {Promise<string>}
 */
async function nextNumber(object) {
  const { NumberRanges } = cds.entities('acme.procurement');
  const updated = await UPDATE(NumberRanges).set('current = current + 1').where({ object });
  if (!updated) throw new Error(`Number range ${object} is not maintained`);
  const { prefix, current } = await SELECT.one.from(NumberRanges).columns('prefix', 'current').where({ object });
  return `${prefix ?? ''}${current}`;
}

module.exports = { nextNumber };
