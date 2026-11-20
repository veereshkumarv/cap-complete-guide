/**
 * What: Performance check of the purchase-order queries the Fiori app sends - list page with
 *     $count, search, deep $expand, server-driven paging and the topSuppliers aggregation - on a
 *     generated volume (default 20,000 orders with 3 items each), as an Auditor (all rows) and as a
 *     Requester (instance-based filter). Prints a timing table.
 * Why: [CAP-M13] / [CAP-STAGE-07] "performance test scripts" - shows the cost of $count, $expand
 *     and restrictions before production; run against HANA in hybrid mode for real numbers.
 * If missing or unlinked: Slow queries are found by users, not by developers.
 *
 * Run: npm run perf            (ORDERS=50000 npm run perf for more data)
 */
const { describe, it, before } = require('node:test');
const cds = require('@sap/cds');

const test = cds.test(`${__dirname}/../..`, '--with-mocks');
const { GET, expect } = test;

const ORDERS = Number(process.env.ORDERS ?? 20000);
const P = '/odata/v4/procurement';
const SUPPLIERS = ['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003'];
const PRODUCT = 'b1000000-0000-4000-8000-000000000001';
const STATUS = ['Draft', 'Submitted', 'Approved', 'Rejected', 'SentToSupplier'];
const USERS = ['alice', 'fred', 'gina', 'carol'];

const as = (username) => ({ auth: { username, password: '' } });
const LIST = '$select=orderNo,status,statusCriticality,totalAmount,currency_code,createdBy&$expand=supplier($select=name)&$orderby=orderNo desc';

describe(`Query performance with ${ORDERS} orders (stage 07)`, () => {
  let seedMs = 0;
  before(async () => {
    const { PurchaseOrders, PurchaseOrderItems } = cds.entities('acme.procurement');
    const started = performance.now();
    for (let offset = 0; offset < ORDERS; offset += 5000) {
      const orders = []; const items = [];
      for (let i = offset; i < Math.min(offset + 5000, ORDERS); i++) {
        const ID = cds.utils.uuid();
        orders.push({ ID, orderNo: `PO-${String(2000000 + i)}`, supplier_ID: SUPPLIERS[i % 3], status: STATUS[i % 5], totalAmount: 30, currency_code: 'EUR', createdBy: USERS[i % 4] });
        for (let n = 0; n < 3; n++) items.push({ ID: cds.utils.uuid(), parent_ID: ID, product_ID: PRODUCT, quantity: 1, netPrice: 10 });
      }
      await INSERT.into(PurchaseOrders).entries(orders);
      await INSERT.into(PurchaseOrderItems).entries(items);
    }
    seedMs = Math.round(performance.now() - started);
  });

  it('measures the typical requests', async () => {
    const cases = [
      ['list page 30 + $count (Auditor, all rows)', 'erin', `${P}/PurchaseOrders?${LIST}&$top=30&$count=true`],
      ['list page 30 + $count (Requester, own rows)', 'alice', `${P}/PurchaseOrders?${LIST}&$top=30&$count=true`],
      ['list page 30 without $count', 'erin', `${P}/PurchaseOrders?${LIST}&$top=30`],
      ['$search by supplier name', 'erin', `${P}/PurchaseOrders?${LIST}&$top=30&$search=Lyon`],
      ['$filter status + $orderby', 'erin', `${P}/PurchaseOrders?${LIST}&$top=30&$filter=status eq 'Submitted'`],
      ['deep $expand items/product (30 orders)', 'erin', `${P}/PurchaseOrders?$top=30&$expand=items($expand=product($select=name))`],
      ['no $top -> server page (50)', 'erin', `${P}/PurchaseOrders?$select=orderNo`],
      ['$top=100000 -> capped (200)', 'erin', `${P}/PurchaseOrders?$select=orderNo&$top=100000`],
      ['topSuppliers aggregation', 'erin', `${P}/topSuppliers(limit=5)`],
    ];
    const results = [];
    for (const [name, user, url] of cases) {
      await GET(url, as(user)); // warm-up (statement cache)
      const runs = [];
      let rows = 0;
      let count = '';
      for (let r = 0; r < 5; r++) {
        const t = performance.now();
        const { data } = await GET(url, as(user));
        runs.push(performance.now() - t);
        rows = data.value.length;
        count = data['@odata.count'] ?? '';
      }
      runs.sort((a, b) => a - b);
      results.push({ request: name, user, rows, $count: count, 'median ms': Math.round(runs[2] * 10) / 10, 'max ms': Math.round(runs[4] * 10) / 10 });
    }
    // cds.test silences console.log - write to stdout directly
    process.stdout.write(`seeded ${ORDERS} orders / ${ORDERS * 3} items in ${seedMs} ms (SQLite in memory)\n`);
    // eslint-disable-next-line no-console -- the timing table is the output of this script
    console.table(results);
    // correctness, not speed: timings depend on the machine
    expect(results.find((r) => r.request.startsWith('no $top')).rows).to.equal(50);
    expect(results.find((r) => r.request.startsWith('$top=100000')).rows).to.equal(200);
  });
});
