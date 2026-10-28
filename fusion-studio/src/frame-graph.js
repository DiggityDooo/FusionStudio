'use strict';
// Frame graph (A23 real-time pipeline core): passes declare the
// resources they read and write; the compiler topologically orders
// them, culls passes whose outputs nobody consumes, computes resource
// lifetimes, and assigns transient resources to shared memory slots
// when their lifetimes are disjoint. This is scheduling math only --
// no GPU calls -- so it is fully testable headlessly.

/**
 * Build a frame graph. builder.addPass(name, {reads, writes, execute})
 * where execute is an opaque tag kept for the runtime layer.
 * Resources written but never declared elsewhere are created on write.
 */
export function createFrameGraph() {
  const passes = [];
  const names = new Set();

  function addPass(name, { reads = [], writes = [], sideEffect = false } = {}) {
    if (!name) throw new Error('frame-graph: pass needs a name');
    if (names.has(name)) throw new Error(`frame-graph: duplicate pass '${name}'`);
    names.add(name);
    passes.push({ name, reads: [...reads], writes: [...writes], sideEffect, index: passes.length });
    return api;
  }

  /**
   * Compile: returns { order: [passNames], culled: [passNames],
   * resources: { name: {firstUse, lastUse, writers, readers} },
   * slots: { resourceName: slotId }, slotCount }.
   * Passes that write resources nobody reads (and have no declared
   * side effect and are not in `finalPasses`) are culled; culling is
   * transitive. Throws on dependency cycles and on a resource read
   * that no live pass writes (unless in `external` inputs).
   */
  function compile({ external = [], finalPasses = [] } = {}) {
    // Producer map: resource -> writing passes (declaration order).
    const producers = new Map();
    for (const pass of passes) {
      for (const r of pass.writes) {
        if (!producers.has(r)) producers.set(r, []);
        producers.get(r).push(pass);
      }
    }
    // Liveness: a pass is live if it has side effects, is final, or
    // writes something a live pass reads. Iterate to a fixed point.
    const live = new Set(passes.filter((p) => p.sideEffect || finalPasses.includes(p.name)).map((p) => p.name));
    let changed = true;
    while (changed) {
      changed = false;
      for (const pass of passes) {
        if (!live.has(pass.name)) continue;
        for (const r of pass.reads) {
          for (const producer of producers.get(r) || []) {
            if (!live.has(producer.name)) { live.add(producer.name); changed = true; }
          }
        }
      }
    }
    const culled = passes.filter((p) => !live.has(p.name)).map((p) => p.name);
    const livePasses = passes.filter((p) => live.has(p.name));

    // Validate reads of live passes.
    for (const pass of livePasses) {
      for (const r of pass.reads) {
        const written = (producers.get(r) || []).some((p) => live.has(p.name));
        if (!written && !external.includes(r)) {
          throw new Error(`frame-graph: pass '${pass.name}' reads '${r}', which no live pass writes and is not external`);
        }
      }
    }

    // Topological order (Kahn, stable by declaration order). Edges:
    // producer -> reader; also writer -> later writer (WAW) and
    // reader -> later writer (WAR) by declaration order.
    const edges = new Map(livePasses.map((p) => [p.name, new Set()]));
    const byName = new Map(livePasses.map((p) => [p.name, p]));
    function addEdge(before, after) {
      if (before !== after) edges.get(before).add(after);
    }
    const accesses = new Map(); // resource -> [{pass, kind, index}]
    for (const pass of livePasses) {
      for (const r of pass.reads) {
        // A read depends on the nearest writer declared before it (or
        // the first writer overall for feedback-style reads).
        const writers = (producers.get(r) || []).filter((p) => live.has(p.name));
        const preceding = writers.filter((p) => p.index < pass.index);
        const producer = preceding.length > 0 ? preceding[preceding.length - 1] : writers[0];
        if (producer) addEdge(producer.name, pass.name);
        (accesses.get(r) || accesses.set(r, []).get(r)).push({ pass: pass.name, kind: 'read', index: pass.index });
      }
      for (const r of pass.writes) {
        (accesses.get(r) || accesses.set(r, []).get(r)).push({ pass: pass.name, kind: 'write', index: pass.index });
      }
    }
    for (const list of accesses.values()) {
      const writers = list.filter((a) => a.kind === 'write');
      for (let i = 1; i < writers.length; i++) addEdge(writers[i - 1].pass, writers[i].pass);
      for (const access of list) {
        if (access.kind !== 'read') continue;
        for (const writer of writers) {
          if (writer.index > access.index) addEdge(access.pass, writer.pass);
        }
      }
    }
    const indegree = new Map(livePasses.map((p) => [p.name, 0]));
    for (const targets of edges.values()) for (const t of targets) indegree.set(t, indegree.get(t) + 1);
    const ready = livePasses.filter((p) => indegree.get(p.name) === 0).map((p) => p.name);
    const order = [];
    while (ready.length > 0) {
      ready.sort((a, b) => byName.get(a).index - byName.get(b).index);
      const next = ready.shift();
      order.push(next);
      for (const t of edges.get(next)) {
        indegree.set(t, indegree.get(t) - 1);
        if (indegree.get(t) === 0) ready.push(t);
      }
    }
    if (order.length !== livePasses.length) {
      const stuck = livePasses.filter((p) => !order.includes(p.name)).map((p) => p.name);
      throw new Error(`frame-graph: dependency cycle involving ${stuck.join(', ')}`);
    }

    // Resource lifetimes in compiled order (external inputs start at -1).
    const position = new Map(order.map((name, i) => [name, i]));
    const resources = {};
    for (const name of external) resources[name] = { firstUse: -1, lastUse: -1, writers: [], readers: [] };
    for (const passName of order) {
      const pass = byName.get(passName);
      for (const r of pass.reads) {
        const res = resources[r] || (resources[r] = { firstUse: position.get(passName), lastUse: -1, writers: [], readers: [] });
        res.firstUse = Math.min(res.firstUse, position.get(passName));
        res.lastUse = Math.max(res.lastUse, position.get(passName));
        res.readers.push(passName);
      }
      for (const r of pass.writes) {
        const res = resources[r] || (resources[r] = { firstUse: position.get(passName), lastUse: -1, writers: [], readers: [] });
        res.firstUse = Math.min(res.firstUse, position.get(passName));
        res.lastUse = Math.max(res.lastUse, position.get(passName));
        res.writers.push(passName);
      }
    }

    // Transient slot assignment: greedy interval coloring over
    // [firstUse, lastUse]. External resources get no slot (imported).
    const slots = {};
    const slotEnds = [];
    const transient = Object.entries(resources)
      .filter(([name]) => !external.includes(name))
      .sort((a, b) => a[1].firstUse - b[1].firstUse);
    for (const [name, res] of transient) {
      let slot = slotEnds.findIndex((end) => end < res.firstUse);
      if (slot === -1) { slot = slotEnds.length; slotEnds.push(res.lastUse); }
      else slotEnds[slot] = res.lastUse;
      slots[name] = slot;
    }

    return { order, culled, resources, slots, slotCount: slotEnds.length };
  }

  const api = { addPass, compile };
  return api;
}
