'use strict';
// Animation state machine kernel (game-engine style): states with looping
// normalized time, parameter-driven transitions (bool/float/trigger),
// exit-time gating, any-state transitions, and timed cross-blends.
//
// Documented semantics:
// - Transition search order: any-state transitions first (skipped when the
//   current state is already the target), then transitions from the current
//   state, each group in declaration order. First fully-satisfied
//   transition fires.
// - A transition fires when all conditions pass and, if hasExitTime, the
//   current state's normalized time >= exitTime.
// - During a blend, blend goes 0 -> 1 linearly over the transition
//   duration; the reported value mixes the two states' samples. The
//   incoming state's clock starts at 0 when the transition fires.
// - Trigger parameters latch until a fired transition lists them in a
//   condition; consumption clears them.

export function createStateMachine({ states, transitions = [], parameters = {}, initial }) {
  if (!Array.isArray(states) || states.length === 0) throw new RangeError('states required');
  const names = new Set(states.map((s) => s.name));
  if (names.size !== states.length) throw new RangeError('duplicate state names');
  const init = initial ?? states[0].name;
  if (!names.has(init)) throw new RangeError(`unknown initial state ${init}`);
  for (const tr of transitions) {
    if (tr.from !== 'any' && !names.has(tr.from)) throw new RangeError(`unknown from-state ${tr.from}`);
    if (!names.has(tr.to)) throw new RangeError(`unknown to-state ${tr.to}`);
  }
  return {
    states: new Map(states.map((s) => [s.name, { duration: 1, loop: true, ...s }])),
    transitions: transitions.map((tr) => ({ duration: 0.25, hasExitTime: false, exitTime: 1, conditions: [], ...tr })),
    parameters: { ...parameters },
    initial: init,
  };
}

/** Create a running instance. stateValues: {stateName: (normalizedTime) => value}. */
export function createMachineInstance(machine, stateValues = {}) {
  return {
    machine,
    stateValues,
    current: machine.initial,
    previous: null,
    blend: 1, // 1 = fully in current state
    blendDuration: 0,
    stateTime: 0, // seconds in current state (also drives the blend clock via blendFrom)
    blendFromTime: 0,
    params: { ...machine.parameters },
    triggers: new Set(),
  };
}

export function setParameter(inst, name, value) {
  inst.params[name] = value;
}

export function setTrigger(inst, name) {
  inst.triggers.add(name);
}

function conditionPasses(inst, cond) {
  const actual = cond.trigger !== undefined
    ? inst.triggers.has(cond.trigger)
    : inst.params[cond.param];
  if (cond.trigger !== undefined) return actual === true;
  switch (cond.op ?? '==') {
    case '==': return actual === cond.value;
    case '!=': return actual !== cond.value;
    case '>': return actual > cond.value;
    case '>=': return actual >= cond.value;
    case '<': return actual < cond.value;
    case '<=': return actual <= cond.value;
    case 'truthy': return Boolean(actual);
    default: throw new Error(`unknown condition op ${cond.op}`);
  }
}

function consumeTriggers(inst, transition) {
  for (const cond of transition.conditions) {
    if (cond.trigger !== undefined) inst.triggers.delete(cond.trigger);
  }
}

function normalizedTime(inst, stateName) {
  const state = inst.machine.states.get(stateName);
  const t = (stateName === inst.current ? inst.stateTime : inst.blendFromTime) / state.duration;
  return state.loop ? ((t % 1) + 1) % 1 : Math.min(1, Math.max(0, t));
}

function sampleState(inst, stateName) {
  const fn = inst.stateValues[stateName];
  return fn ? fn(normalizedTime(inst, stateName)) : 0;
}

/**
 * Advance the machine. Returns {state, previous, blend, value} where value
 * mixes the outgoing and incoming state samples during a transition.
 */
export function updateMachine(inst, dt) {
  const machine = inst.machine;
  inst.stateTime += dt;
  if (inst.previous !== null) inst.blendFromTime += dt;

  // Blend in progress? Advance it; a completed blend clears `previous`.
  if (inst.previous !== null && inst.blendDuration > 0) {
    inst.blend = Math.min(1, inst.blend + dt / inst.blendDuration);
    if (inst.blend >= 1) inst.previous = null;
  }

  // Transition search (only when not mid-blend: engines queue or ignore;
  // this kernel finishes the current blend first -- documented).
  if (inst.previous === null) {
    const nt = normalizedTime(inst, inst.current);
    const candidates = [
      ...machine.transitions.filter((tr) => tr.from === 'any' && tr.to !== inst.current),
      ...machine.transitions.filter((tr) => tr.from === inst.current),
    ];
    for (const tr of candidates) {
      if (tr.hasExitTime && nt < tr.exitTime) continue;
      if (!tr.conditions.every((cond) => conditionPasses(inst, cond))) continue;
      consumeTriggers(inst, tr);
      inst.previous = inst.current;
      inst.blendFromTime = inst.stateTime;
      inst.current = tr.to;
      inst.stateTime = 0;
      inst.blendDuration = tr.duration;
      inst.blend = tr.duration > 0 ? 0 : 1;
      if (inst.blend >= 1) inst.previous = null;
      break;
    }
  }

  const currentValue = sampleState(inst, inst.current);
  let value = currentValue;
  if (inst.previous !== null) {
    const prevValue = sampleState(inst, inst.previous);
    value = prevValue * (1 - inst.blend) + currentValue * inst.blend;
  }
  return { state: inst.current, previous: inst.previous, blend: inst.blend, value };
}
