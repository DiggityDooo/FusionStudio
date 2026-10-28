import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStateMachine, createMachineInstance, setParameter, setTrigger, updateMachine,
} from '../src/anim-state-machine.js';

function locomotion() {
  return createStateMachine({
    states: [
      { name: 'idle', duration: 2 },
      { name: 'run', duration: 0.8 },
      { name: 'jump', duration: 0.6, loop: false },
    ],
    parameters: { speed: 0, grounded: true },
    transitions: [
      { from: 'idle', to: 'run', conditions: [{ param: 'speed', op: '>', value: 3 }], duration: 0.2 },
      { from: 'run', to: 'idle', conditions: [{ param: 'speed', op: '<', value: 1 }], duration: 0.3 },
      { from: 'any', to: 'jump', conditions: [{ trigger: 'jump' }], duration: 0.1 },
      { from: 'jump', to: 'idle', conditions: [{ param: 'grounded', op: '==', value: true }], hasExitTime: true, exitTime: 0.9, duration: 0.15 },
    ],
    initial: 'idle',
  });
}
const values = { idle: () => 0, run: () => 10, jump: () => 20 };

test('conditions gate transitions; blend ramps linearly and mixes values', () => {
  const inst = createMachineInstance(locomotion(), values);
  let out = updateMachine(inst, 0.1);
  assert.equal(out.state, 'idle');
  assert.equal(out.value, 0);
  setParameter(inst, 'speed', 5);
  out = updateMachine(inst, 0.05); // fires here: blend starts at 0
  assert.equal(out.state, 'run');
  assert.equal(out.previous, 'idle');
  assert.equal(out.blend, 0);
  assert.equal(out.value, 0, 'still fully the old pose at fire instant');
  out = updateMachine(inst, 0.1); // half of the 0.2s blend
  assert.ok(Math.abs(out.blend - 0.5) < 1e-9, `blend ${out.blend}`);
  assert.ok(Math.abs(out.value - 5) < 1e-9, 'midpoint mix');
  out = updateMachine(inst, 0.1); // blend completes
  assert.equal(out.state, 'run');
  assert.equal(out.previous, null);
  assert.equal(out.value, 10);
});

test('any-state trigger fires once and is consumed', () => {
  const inst = createMachineInstance(locomotion(), values);
  updateMachine(inst, 0.1);
  setTrigger(inst, 'jump');
  let out = updateMachine(inst, 0.05);
  assert.equal(out.state, 'jump');
  // Finish the blend, land with exit time: still airborne before 0.9.
  updateMachine(inst, 0.1);
  setParameter(inst, 'grounded', true);
  out = updateMachine(inst, 0.2); // jump time 0.3/0.6 = 0.5 < 0.9: no landing yet
  assert.equal(out.state, 'jump', 'exit time gates the landing');
  out = updateMachine(inst, 0.25); // normalized 0.55/0.6 > 0.9
  assert.equal(out.state, 'idle', 'lands after exit time');
  // The trigger was consumed: no spontaneous re-jump.
  updateMachine(inst, 0.2);
  out = updateMachine(inst, 0.2);
  assert.equal(out.state, 'idle');
});

test('any-state does not self-fire; declaration order breaks ties', () => {
  const sm = createStateMachine({
    states: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    transitions: [
      { from: 'any', to: 'b', conditions: [{ trigger: 'go' }], duration: 0 },
      { from: 'a', to: 'c', conditions: [{ trigger: 'go' }], duration: 0 },
    ],
    initial: 'a',
  });
  const inst = createMachineInstance(sm, { a: () => 1, b: () => 2, c: () => 3 });
  setTrigger(inst, 'go');
  const out = updateMachine(inst, 0.016);
  assert.equal(out.state, 'b', 'any-state wins over local (documented order)');
  setTrigger(inst, 'go');
  const out2 = updateMachine(inst, 0.016);
  assert.equal(out2.state, 'b', 'already in target: no self transition');
});

test('state clocks loop or clamp; sampler receives normalized time', () => {
  const sm = createStateMachine({
    states: [{ name: 'spin', duration: 2, loop: true }, { name: 'once', duration: 1, loop: false }],
    transitions: [{ from: 'spin', to: 'once', conditions: [{ trigger: 'x' }], duration: 0 }],
    initial: 'spin',
  });
  const seen = [];
  const inst = createMachineInstance(sm, {
    spin: (nt) => { seen.push(nt); return nt; },
    once: (nt) => nt,
  });
  updateMachine(inst, 1.5);
  assert.ok(Math.abs(seen.at(-1) - 0.75) < 1e-9, 'normalized 1.5/2');
  updateMachine(inst, 1.0); // wraps: 2.5s -> 0.25
  assert.ok(Math.abs(seen.at(-1) - 0.25) < 1e-9, 'loops');
  setTrigger(inst, 'x');
  updateMachine(inst, 0.1);
  const out = updateMachine(inst, 5); // far past the 1s non-looping state
  assert.equal(out.value, 1, 'non-looping clamps at normalized 1');
});

test('mid-blend transitions wait for the blend to finish', () => {
  const inst = createMachineInstance(locomotion(), values);
  setParameter(inst, 'speed', 5);
  updateMachine(inst, 0.05); // fires idle->run
  setParameter(inst, 'speed', 0); // condition for run->idle now true
  const during = updateMachine(inst, 0.05);
  assert.equal(during.state, 'run', 'still blending to run; no interruption');
  updateMachine(inst, 0.15); // blend completes (0.2 total), search runs
  const after = updateMachine(inst, 0.05);
  assert.equal(after.state, 'idle', 'return transition fires after blend completes');
});

test('machine validation rejects bad graphs', () => {
  assert.throws(() => createStateMachine({ states: [] }), RangeError);
  assert.throws(() => createStateMachine({ states: [{ name: 'a' }, { name: 'a' }] }), /duplicate/);
  assert.throws(() => createStateMachine({
    states: [{ name: 'a' }],
    transitions: [{ from: 'a', to: 'nope', conditions: [] }],
  }), /to-state/);
});
