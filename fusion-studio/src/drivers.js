'use strict';
// Set Driven Key / drivers (A13 "Set Driven Key/drivers and driver
// expressions"; also A15 expression-driven animation): named scene
// properties, some manual, some driven by expressions over other
// properties (src/expressions.js). Evaluation is dependency-ordered;
// cycles and writes to driven properties are explicit errors.

import { compileExpression } from './expressions.js';

export function createDriverSystem() {
  const manual = new Map();   // name -> value
  const drivers = new Map();  // target -> { source, compiled }

  function addProperty(name, value) {
    if (drivers.has(name)) throw new Error(`drivers: '${name}' is driven; remove its driver first`);
    manual.set(name, value);
  }

  function addDriver(target, source) {
    const compiled = compileExpression(source);
    drivers.set(target, { source, compiled });
    manual.delete(target);
    return compiled.variables;
  }

  function removeDriver(target) {
    const existed = drivers.delete(target);
    return existed;
  }

  function isDriven(name) { return drivers.has(name); }

  /** Dependency order of driven targets (dependencies first). */
  function evaluationOrder() {
    const order = [];
    const state = new Map();
    const stack = [];
    function visit(name) {
      const s = state.get(name);
      if (s === 'done') return;
      if (s === 'visiting') {
        throw new Error(`drivers: cycle detected: ${[...stack.slice(stack.indexOf(name)), name].join(' -> ')}`);
      }
      state.set(name, 'visiting');
      stack.push(name);
      for (const dep of drivers.get(name).compiled.variables) {
        if (drivers.has(dep)) visit(dep);
      }
      stack.pop();
      state.set(name, 'done');
      order.push(name);
    }
    for (const name of drivers.keys()) visit(name);
    return order;
  }

  /**
   * Evaluate all drivers in dependency order. `overrides` supplies
   * transient input values (e.g. current frame time) without storing
   * them. Returns a Map of every property (manual + driven).
   */
  function evaluate(overrides = {}) {
    const values = new Map(manual);
    for (const [k, v] of Object.entries(overrides)) values.set(k, v);
    for (const name of evaluationOrder()) {
      const { compiled } = drivers.get(name);
      const context = {};
      for (const varName of compiled.variables) {
        if (values.has(varName)) context[varName] = values.get(varName);
      }
      values.set(name, compiled.evaluate(context));
    }
    return values;
  }

  function get(name, overrides) {
    const values = evaluate(overrides);
    if (!values.has(name)) throw new Error(`drivers: unknown property '${name}'`);
    return values.get(name);
  }

  function setManual(name, value) {
    if (drivers.has(name)) {
      throw new Error(`drivers: '${name}' is driven by "${drivers.get(name).source}"; remove the driver to set it manually`);
    }
    manual.set(name, value);
  }

  return { addProperty, addDriver, removeDriver, isDriven, evaluationOrder, evaluate, get, setManual };
}
