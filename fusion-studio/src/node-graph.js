'use strict';
// Generic node-graph evaluator (A27 "Node-based visual programming"):
// the value/dataflow substrate distinct from geometry-nodes (which is
// mesh-domain, A4). Node types are registered with typed input/output
// sockets and an evaluate function; graphs evaluate in topological
// order with per-evaluation memoization, cycle detection, and default
// input values. Expression nodes reuse src/expressions.js.

import { compileExpression } from './expressions.js';

/** Registry of node types for a graph instance. */
export function createNodeGraph() {
  const types = new Map();
  const nodes = new Map();
  const links = []; // {from, fromSocket, to, toSocket}
  let seq = 0;

  function defineType(name, spec) {
    if (!spec || typeof spec.evaluate !== 'function') {
      throw new Error(`node-graph: type '${name}' needs an evaluate function`);
    }
    types.set(name, {
      inputs: spec.inputs || {},   // socket -> default value
      outputs: spec.outputs || ['out'],
      params: spec.params || {},   // param -> default value
      anyInputs: Boolean(spec.anyInputs),
      evaluate: spec.evaluate,
    });
  }

  function addNode(type, params = {}) {
    const def = types.get(type);
    if (!def) throw new Error(`node-graph: unknown node type '${type}'`);
    const id = `n${seq++}`;
    nodes.set(id, { id, type, params: { ...def.params, ...params } });
    return id;
  }

  function getNode(id) {
    const node = nodes.get(id);
    if (!node) throw new Error(`node-graph: no node '${id}'`);
    return node;
  }

  function connect(fromId, fromSocket, toId, toSocket) {
    const from = getNode(fromId);
    const to = getNode(toId);
    if (!types.get(from.type).outputs.includes(fromSocket)) {
      throw new Error(`node-graph: '${from.type}' has no output '${fromSocket}'`);
    }
    const toDef = types.get(to.type);
    if (!toDef.anyInputs && !(toSocket in toDef.inputs)) {
      throw new Error(`node-graph: '${to.type}' has no input '${toSocket}'`);
    }
    // One link per input socket: a new link replaces the old one.
    for (let i = links.length - 1; i >= 0; i--) {
      if (links[i].to === toId && links[i].toSocket === toSocket) links.splice(i, 1);
    }
    links.push({ from: fromId, fromSocket, to: toId, toSocket });
  }

  function setParam(id, key, value) {
    const node = getNode(id);
    if (!(key in types.get(node.type).params)) {
      throw new Error(`node-graph: '${node.type}' has no param '${key}'`);
    }
    node.params[key] = value;
  }

  /**
   * Evaluate the graph. Returns a Map nodeId -> {socket: value} for
   * every node, computed in topological order. Each node evaluates at
   * most once per call. Cycles throw with the cycle path.
   */
  function evaluate() {
    const results = new Map();
    const state = new Map(); // id -> 'visiting' | 'done'
    const stack = [];

    function visit(id) {
      const s = state.get(id);
      if (s === 'done') return results.get(id);
      if (s === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(id)), id].join(' -> ');
        throw new Error(`node-graph: cycle detected: ${cycle}`);
      }
      state.set(id, 'visiting');
      stack.push(id);
      const node = getNode(id);
      const def = types.get(node.type);
      const inputs = { ...def.inputs };
      for (const link of links) {
        if (link.to !== id) continue;
        const upstream = visit(link.from);
        inputs[link.toSocket] = upstream[link.fromSocket];
      }
      const outputs = def.evaluate(inputs, node.params) || {};
      for (const socket of def.outputs) {
        if (!(socket in outputs)) throw new Error(`node-graph: '${node.type}' did not produce '${socket}'`);
      }
      results.set(id, outputs);
      stack.pop();
      state.set(id, 'done');
      return outputs;
    }

    for (const id of nodes.keys()) visit(id);
    return results;
  }

  /** Convenience: evaluate and read one output socket. */
  function output(id, socket = 'out') {
    return evaluate().get(id)[socket];
  }

  defineType('const', {
    params: { value: 0 },
    outputs: ['out'],
    evaluate: (inputs, params) => ({ out: params.value }),
  });
  for (const [name, fn] of Object.entries({
    add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b,
    div: (a, b) => a / b, min: (a, b) => Math.min(a, b), max: (a, b) => Math.max(a, b),
  })) {
    defineType(name, {
      inputs: { a: 0, b: 0 },
      outputs: ['out'],
      evaluate: (inputs) => ({ out: fn(inputs.a, inputs.b) }),
    });
  }
  defineType('clamp', {
    inputs: { x: 0, lo: 0, hi: 1 },
    outputs: ['out'],
    evaluate: (inputs) => ({ out: Math.min(inputs.hi, Math.max(inputs.lo, inputs.x)) }),
  });
  defineType('mix', {
    inputs: { a: 0, b: 1, t: 0 },
    outputs: ['out'],
    evaluate: (inputs) => ({ out: inputs.a + (inputs.b - inputs.a) * inputs.t }),
  });
  defineType('select', {
    inputs: { cond: 0, a: 0, b: 0 },
    outputs: ['out'],
    evaluate: (inputs) => ({ out: inputs.cond ? inputs.a : inputs.b }),
  });
  defineType('expression', {
    anyInputs: true,
    params: { source: 'x' },
    outputs: ['out'],
    evaluate: (inputs, params) => ({ out: compileExpression(params.source).evaluate(inputs) }),
  });

  return { defineType, addNode, getNode, connect, setParam, evaluate, output };
}
