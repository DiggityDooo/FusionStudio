'use strict';
// Macro recorder + history-based authoring (A27): captures an ordered
// list of tool invocations (name, JSON-safe params, timestamp), and can
// replay them deterministically through a caller-supplied executor.
// Steps can be edited, reordered, trimmed, and serialized; replay-time
// parameter overrides let a recorded macro be re-run with new values.
// Replay never executes code -- the executor interprets step names.

function assertStep(step) {
  if (!step || typeof step.name !== 'string' || !step.name) {
    throw new Error('macro: step needs a non-empty name');
  }
  if (step.params !== undefined && (typeof step.params !== 'object' || step.params === null)) {
    throw new Error('macro: step params must be an object');
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Create an empty macro recorder. */
export function createMacro(name = 'Untitled macro') {
  const steps = [];
  let t = 0;
  return {
    name,
    /** Record one invocation. Params are deep-cloned (must be JSON-safe). */
    record(stepName, params = {}, timestamp) {
      assertStep({ name: stepName, params });
      const cloned = clone(params);
      steps.push({ name: stepName, params: cloned === undefined ? {} : cloned, t: timestamp ?? t++ });
      return steps.length;
    },
    steps: () => clone(steps),

    /** Replace a step's params (history-based re-authoring). */
    setParams(index, params) {
      if (!steps[index]) throw new Error(`macro: no step ${index}`);
      assertStep({ name: steps[index].name, params });
      steps[index].params = clone(params) || {};
    },
    /** Delete a step. Returns the removed step. */
    deleteStep(index) {
      if (!steps[index]) throw new Error(`macro: no step ${index}`);
      return steps.splice(index, 1)[0];
    },
    /** Move a step to a new position. */
    moveStep(index, toIndex) {
      if (!steps[index] || !steps[toIndex]) throw new Error('macro: move out of range');
      const [step] = steps.splice(index, 1);
      steps.splice(toIndex, 0, step);
    },
    /** Keep only steps before index (trim the tail of the history). */
    truncate(index) {
      steps.length = Math.max(0, Math.min(index, steps.length));
    },
    clear() { steps.length = 0; },
    length: () => steps.length,

    /**
     * Replay through executor(name, params, index). Overrides map a step
     * index (or step name, for all such steps) to replacement params.
     * Returns the executor results in order. On an executor throw, the
     * error is tagged with the step index and rethrown.
     */
    replay(executor, { overrides = {}, from = 0, to = steps.length } = {}) {
      const results = [];
      for (let i = from; i < Math.min(to, steps.length); i++) {
        const step = steps[i];
        let params = step.params;
        if (Object.prototype.hasOwnProperty.call(overrides, i)) params = overrides[i];
        else if (Object.prototype.hasOwnProperty.call(overrides, step.name)) params = overrides[step.name];
        try {
          results.push(executor(step.name, clone(params), i));
        } catch (err) {
          err.stepIndex = i;
          err.stepName = step.name;
          throw err;
        }
      }
      return results;
    },

    /** A reusable callable that replays this macro (with fixed overrides). */
    asFunction(executor, overrides = {}) {
      return () => this.replay(executor, { overrides });
    },

    toJSON() {
      return { kind: 'fusion-macro', version: 1, name, steps: clone(steps) };
    },
  };
}

/** Restore a macro from createMacro().toJSON() output. */
export function macroFromJSON(json) {
  if (!json || json.kind !== 'fusion-macro') throw new Error('macro: not a fusion-macro document');
  const macro = createMacro(json.name || 'Untitled macro');
  for (const step of json.steps || []) {
    assertStep(step);
    macro.record(step.name, step.params || {}, step.t);
  }
  return macro;
}

/** Merge several macros into one, in order (history splicing). */
export function concatMacros(macros, name = 'Combined macro') {
  const out = createMacro(name);
  for (const macro of macros) {
    for (const step of macro.steps()) out.record(step.name, step.params);
  }
  return out;
}
