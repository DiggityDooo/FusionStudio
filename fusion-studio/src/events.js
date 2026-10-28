'use strict';
// Event bus for scene/tool callbacks (A27 "Event handlers and
// callbacks"). Handlers run in priority order (higher first, then
// registration order). A throwing handler never breaks the others: its
// error is collected and returned. Wildcard '*' handlers receive every
// event as (eventName, payload). No eval, no globals -- buses are
// independent instances, safe for tests and headless batch runs.

/** Create an independent event bus. */
export function createEventBus() {
  const listeners = new Map(); // event -> [{handler, priority, once, seq}]
  let seq = 0;

  function listFor(event) {
    if (!listeners.has(event)) listeners.set(event, []);
    return listeners.get(event);
  }

  function removeEntry(event, entry) {
    const list = listeners.get(event);
    if (!list) return;
    const i = list.indexOf(entry);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) listeners.delete(event);
  }

  /** Subscribe. Returns an unsubscribe function. */
  function on(event, handler, { priority = 0, once = false } = {}) {
    if (typeof handler !== 'function') throw new Error('events: handler must be a function');
    const entry = { handler, priority, once, seq: seq++ };
    listFor(event).push(entry);
    return () => removeEntry(event, entry);
  }

  /** Subscribe for a single emission. */
  function once(event, handler, opts = {}) {
    return on(event, handler, { ...opts, once: true });
  }

  /** Remove a specific handler (all its registrations for the event). */
  function off(event, handler) {
    const list = listeners.get(event);
    if (!list) return 0;
    const before = list.length;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].handler === handler) list.splice(i, 1);
    }
    if (list.length === 0) listeners.delete(event);
    return before - list.length;
  }

  function ordered(event) {
    const specific = (listeners.get(event) || []).map((e) => ({ ...e, wildcard: false, event }));
    const wild = event === '*'
      ? []
      : (listeners.get('*') || []).map((e) => ({ ...e, wildcard: true, event: '*' }));
    return [...specific, ...wild].sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  }

  /**
   * Emit synchronously. Returns { results, errors } in execution order;
   * errors are { event, error } and do not stop later handlers.
   */
  function emit(event, payload) {
    const results = [];
    const errors = [];
    for (const entry of ordered(event)) {
      if (entry.once) removeEntry(entry.event, (listeners.get(entry.event) || []).find(
        (e) => e.handler === entry.handler && e.seq === entry.seq));
      try {
        results.push(entry.wildcard ? entry.handler(event, payload) : entry.handler(payload));
      } catch (error) {
        results.push(undefined);
        errors.push({ event, error });
      }
    }
    return { results, errors };
  }

  /** Emit awaiting each handler in order (async handlers supported). */
  async function emitAsync(event, payload) {
    const results = [];
    const errors = [];
    for (const entry of ordered(event)) {
      if (entry.once) removeEntry(entry.event, (listeners.get(entry.event) || []).find(
        (e) => e.handler === entry.handler && e.seq === entry.seq));
      try {
        results.push(await (entry.wildcard ? entry.handler(event, payload) : entry.handler(payload)));
      } catch (error) {
        results.push(undefined);
        errors.push({ event, error });
      }
    }
    return { results, errors };
  }

  function listenerCount(event) {
    if (event !== undefined) return (listeners.get(event) || []).length;
    let n = 0;
    for (const list of listeners.values()) n += list.length;
    return n;
  }

  function clear(event) {
    if (event === undefined) listeners.clear();
    else listeners.delete(event);
  }

  return { on, once, off, emit, emitAsync, listenerCount, clear };
}
