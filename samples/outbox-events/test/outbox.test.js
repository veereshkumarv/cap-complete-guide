/**
 * What: Tests of the outbox sample: confirm delivers invoice and booking after commit; messages and
 *     queued calls are stored in cds.outbox.Messages inside the transaction and dropped on rollback;
 *     redelivered messages are ignored; failing calls are retried; unrecoverable ones become dead
 *     letters.
 * Why: [CAP-M07] [CAP-M18] the guarantees of the transactional outbox are only trustworthy when
 *     each one is demonstrated.
 * If missing or unlinked: A configuration change (queued: false) silently turns reliable delivery
 *     into fire-and-forget.
 */
const { describe, it } = require('node:test');
const cds = require('@sap/cds');

const { POST, expect } = cds.test(`${__dirname}/..`);

const P = '/odata/v4/orders';
const O1 = 'f1000000-0000-4000-8000-000000000001';
const O2 = 'f1000000-0000-4000-8000-000000000002';
const O3 = 'f1000000-0000-4000-8000-000000000003';
const TOPIC = 'OrderService.OrderConfirmed';
const confirm = (ID) => POST(`${P}/Orders(${ID})/OrderService.confirm`, {});
const rows = (entity, order_ID) => SELECT.from(`sample.outbox.${entity}`).where({ order_ID });
const outbox = () => SELECT.from('cds.outbox.Messages');
const serviceOf = (row) => JSON.parse(row.msg).service; // target is the generic 'queue'

/** Polls until fn() returns a truthy value - outbox delivery is asynchronous. */
async function eventually(fn, timeout = 6000) {
  const end = Date.now() + timeout;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Transactional outbox', () => {
  it('confirm: invoice (message consumer) and booking (queued call) arrive after commit', async () => {
    const { data } = await confirm(O1);
    expect(data.status).to.equal('Confirmed');
    await eventually(async () => (await rows('Invoices', O1)).length && (await rows('ShipmentBookings', O1)).length);
    expect(await rows('Invoices', O1)).to.have.length(1);
    const err = await confirm(O1).catch((e) => e);
    expect(err.status).to.equal(409);
  });

  it('stores message and queued call in cds.outbox.Messages inside the transaction', async () => {
    const order = cds.utils.uuid();
    const messaging = await cds.connect.to('messaging');
    const shipping = cds.queued(await cds.connect.to('ShippingService'));
    await cds.tx(async (tx) => {
      await messaging.emit(TOPIC, { order, amount: 1 });
      await shipping.send('book', { order });
      const queued = (await tx.run(outbox())).filter((m) => m.msg.includes(order));
      expect(queued.map(serviceOf).sort()).to.deep.equal(['ShippingService', 'messaging']);
      expect(await rows('Invoices', order)).to.have.length(0); // nothing delivered before commit
    });
    await eventually(async () => (await rows('Invoices', order)).length);
  });

  it('drops message and call when the transaction rolls back', async () => {
    const messaging = await cds.connect.to('messaging');
    await cds.tx(async () => {
      await messaging.emit(TOPIC, { order: O3, amount: 99.9 });
      throw new Error('business rule failed after emit');
    }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await rows('Invoices', O3)).to.have.length(0);
    expect((await outbox()).some((m) => m.msg.includes(O3))).to.equal(false);
  });

  it('ignores a redelivered message (idempotent consumer)', async () => {
    const order = cds.utils.uuid();
    const direct = cds.unqueued(await cds.connect.to('messaging')); // deliver synchronously, twice
    await direct.emit(TOPIC, { order, amount: 5 });
    await direct.emit(TOPIC, { order, amount: 5 });
    expect(await rows('Invoices', order)).to.have.length(1);
  });
});

describe('Queued service calls', () => {
  it('retries a failing call with backoff until it succeeds', async () => {
    const shipping = await cds.connect.to('ShippingService');
    let calls = 0;
    shipping.prepend(() => shipping.on('book', (req, next) => {
      if (req.data.order !== O2) return next();
      calls++;
      if (calls <= 2) throw Object.assign(new Error('Carrier API unavailable'), { status: 503 });
      return next();
    }));
    await confirm(O2); // the user's request succeeds although the carrier is down
    await eventually(async () => (await rows('ShipmentBookings', O2)).length);
    expect(calls).to.equal(3); // 2 failures, then success (~0.5 s + 1.25 s backoff)
  });

  it('turns an unrecoverable error into a dead letter instead of retrying', async () => {
    const unknown = cds.utils.uuid();
    await cds.queued(await cds.connect.to('ShippingService')).send('book', { order: unknown });
    const dead = await eventually(async () => (await outbox()).find((m) => m.msg.includes(unknown) && m.attempts >= 10));
    expect(serviceOf(dead)).to.equal('ShippingService');
    expect(dead.lastError).to.contain('Unknown order');
    expect(await rows('ShipmentBookings', unknown)).to.have.length(0);
  });
});
