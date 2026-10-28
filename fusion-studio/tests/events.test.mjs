import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/events.js';

test('handlers run in priority order, then registration order', () => {
  const bus = createEventBus();
  const order = [];
  bus.on('save', () => order.push('low'), { priority: -1 });
  bus.on('save', () => order.push('first'));
  bus.on('save', () => order.push('high'), { priority: 10 });
  bus.on('save', () => order.push('second'));
  const { results, errors } = bus.emit('save', { path: 'a.fsn' });
  assert.deepEqual(order, ['high', 'first', 'second', 'low']);
  assert.equal(results.length, 4);
  assert.deepEqual(errors, []);
});

test('payloads pass through and results collect in execution order', () => {
  const bus = createEventBus();
  bus.on('frame', (f) => f * 2, { priority: 1 });
  bus.on('frame', (f) => f + 100);
  const { results } = bus.emit('frame', 21);
  assert.deepEqual(results, [42, 121]);
});

test('once handlers fire exactly once; unsubscribe and off remove handlers', () => {
  const bus = createEventBus();
  let count = 0;
  bus.once('open', () => { count++; });
  bus.emit('open');
  bus.emit('open');
  assert.equal(count, 1);
  assert.equal(bus.listenerCount('open'), 0);

  let n = 0;
  const unsub = bus.on('tick', () => { n++; });
  bus.emit('tick');
  unsub();
  bus.emit('tick');
  assert.equal(n, 1);

  const handler = () => { n += 10; };
  bus.on('tick', handler);
  bus.on('tick', handler);
  assert.equal(bus.off('tick', handler), 2, 'off removes every registration of the handler');
  bus.emit('tick');
  assert.equal(n, 1);
});

test('a throwing handler is isolated: later handlers still run, error is reported', () => {
  const bus = createEventBus();
  const ran = [];
  bus.on('render', () => { ran.push('a'); throw new Error('boom'); }, { priority: 5 });
  bus.on('render', () => { ran.push('b'); return 'ok'; });
  const { results, errors } = bus.emit('render');
  assert.deepEqual(ran, ['a', 'b']);
  assert.deepEqual(results, [undefined, 'ok']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, 'boom');
  assert.equal(errors[0].event, 'render');
});

test('wildcard handlers observe every event with its name', () => {
  const bus = createEventBus();
  const seen = [];
  bus.on('*', (event, payload) => seen.push([event, payload]));
  bus.emit('scene.added', { id: 1 });
  bus.emit('scene.removed', { id: 2 });
  assert.deepEqual(seen, [['scene.added', { id: 1 }], ['scene.removed', { id: 2 }]]);
  // Emitting '*' itself does not double-invoke wildcard handlers.
  const before = seen.length;
  bus.emit('*', null);
  assert.equal(seen.length, before + 1);
});

test('emitAsync awaits handlers in order and isolates async failures', async () => {
  const bus = createEventBus();
  const order = [];
  bus.on('bake', async () => { await new Promise((r) => setTimeout(r, 5)); order.push('slow'); return 1; }, { priority: 2 });
  bus.on('bake', async () => { order.push('fast'); throw new Error('async boom'); }, { priority: 1 });
  bus.on('bake', () => { order.push('sync'); return 3; });
  const { results, errors } = await bus.emitAsync('bake');
  assert.deepEqual(order, ['slow', 'fast', 'sync'], 'sequential, priority-ordered despite the slow first handler');
  assert.deepEqual(results, [1, undefined, 3]);
  assert.equal(errors.length, 1);
});

test('buses are independent; clear and counts behave', () => {
  const a = createEventBus();
  const b = createEventBus();
  let hit = 0;
  a.on('x', () => { hit++; });
  b.emit('x');
  assert.equal(hit, 0);
  a.emit('x');
  assert.equal(hit, 1);
  a.on('y', () => {});
  assert.equal(a.listenerCount(), 2);
  a.clear('x');
  assert.equal(a.listenerCount('x'), 0);
  a.clear();
  assert.equal(a.listenerCount(), 0);
  assert.throws(() => a.on('x', 'not-a-function'), /handler must be a function/);
});
