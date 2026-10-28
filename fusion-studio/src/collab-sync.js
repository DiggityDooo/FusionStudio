// Collaboration core (A32 baseline): an operation-log scene document with
// last-writer-wins field resolution, Lamport clocks, and deterministic
// convergence. Transport-agnostic: ops are plain JSON and can ride any
// channel (websocket, file sync, sneakernet). Also: presence, roles,
// version snapshots with rollback, and review comments.
// Note: `src/collab.js` holds the other session's A32 preview module; this
// file carries the test-verified kernel (tests/collab.test.mjs).
//
// Document: { objects: { [id]: { key: value } }, tombs: { [id]: stamp },
//             fields: { [id]: { [key]: stamp } } }
// A stamp is [lamportClock, actorId]; later stamps win (tuple compare).

export function createDocument() {
  return { objects: {}, tombs: {}, fields: {} };
}

export function createActor(id) {
  if (!id) throw new Error('Actor id required.');
  return { id: String(id), clock: 0 };
}

export function nextOp(actor, op) {
  actor.clock += 1;
  return { opId: `${actor.id}:${actor.clock}`, actor: actor.id, clock: actor.clock, ...op };
}

export function observeOp(actor, op) {
  actor.clock = Math.max(actor.clock, op.clock || 0);
  return actor;
}

const stampOf = (op) => [op.clock, op.actor];
const stampWins = (a, b) => !b || a[0] > b[0] || (a[0] === b[0] && String(a[1]) > String(b[1]));

export function applyOp(doc, op) {
  if (!op || !op.type || !op.objectId) throw new Error('Op needs type and objectId.');
  const stamp = stampOf(op);
  const id = op.objectId;
  if (op.type === 'remove') {
    if (stampWins(stamp, doc.tombs[id])) {
      doc.tombs[id] = stamp;
      delete doc.objects[id];
      delete doc.fields[id];
    }
    return doc;
  }
  if (op.type === 'set') {
    // A set older than the tombstone lost the race against a remove.
    if (!stampWins(stamp, doc.tombs[id])) return doc;
    doc.objects[id] = doc.objects[id] || {};
    doc.fields[id] = doc.fields[id] || {};
    if (stampWins(stamp, doc.fields[id][op.key])) {
      doc.fields[id][op.key] = stamp;
      if (op.value === undefined) delete doc.objects[id][op.key];
      else doc.objects[id][op.key] = op.value;
    }
    return doc;
  }
  throw new Error(`Unknown op type: ${op.type}`);
}

export function applyOps(doc, ops) {
  for (const op of ops) applyOp(doc, op);
  return doc;
}

// Canonical op ordering: (clock, actor, opId) — every replica sorts the same.
export function sortOps(ops) {
  return ops.slice().sort((a, b) => (a.clock - b.clock)
    || (String(a.actor) < String(b.actor) ? -1 : String(a.actor) > String(b.actor) ? 1 : 0)
    || (String(a.opId) < String(b.opId) ? -1 : 1));
}

export function mergeLogs(...logs) {
  const byId = new Map();
  for (const log of logs) for (const op of log) if (!byId.has(op.opId)) byId.set(op.opId, op);
  return sortOps([...byId.values()]);
}

export function documentFromLog(ops) {
  return applyOps(createDocument(), sortOps(ops));
}

// Plain scene state (no conflict metadata).
export function documentState(doc) {
  const out = {};
  for (const [id, obj] of Object.entries(doc.objects)) out[id] = { ...obj };
  return out;
}

// Minimal op sequence that reproduces the same state from empty.
export function compactLog(ops) {
  const doc = documentFromLog(ops);
  const out = [];
  for (const [id, stamp] of Object.entries(doc.tombs)) {
    out.push({ opId: `tomb:${id}`, actor: stamp[1], clock: stamp[0], type: 'remove', objectId: id });
  }
  for (const [id, obj] of Object.entries(doc.objects)) {
    for (const [key, value] of Object.entries(obj)) {
      const stamp = doc.fields[id][key];
      out.push({ opId: `set:${id}:${key}`, actor: stamp[1], clock: stamp[0], type: 'set', objectId: id, key, value });
    }
  }
  return sortOps(out);
}

// --- versions (snapshots, rollback) ------------------------------------------

export function snapshot(doc, label = '') {
  return { label: String(label).slice(0, 80), state: JSON.parse(JSON.stringify(documentState(doc))), at: Date.now() };
}

export function restoreSnapshot(snap) {
  const doc = createDocument();
  let clock = 0;
  for (const [id, obj] of Object.entries(snap.state)) {
    for (const [key, value] of Object.entries(obj)) {
      applyOp(doc, { opId: `snap:${id}:${key}`, actor: 'snapshot', clock: ++clock, type: 'set', objectId: id, key, value });
    }
  }
  return doc;
}

// --- presence & roles -----------------------------------------------------------

export function createPresence(actor, { selection = [], cursor = null } = {}) {
  return { actor: actor.id, selection: selection.slice(), cursor, heartbeat: Date.now() };
}

export function isPresenceStale(presence, now = Date.now(), ttlMs = 15000) {
  return now - presence.heartbeat > ttlMs;
}

const ROLE_RANK = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

export function canPerform(role, action) {
  const rank = ROLE_RANK[role];
  if (rank === undefined) throw new Error(`Unknown role: ${role}`);
  if (action === 'view') return rank >= 0;
  if (action === 'comment') return rank >= 1;
  if (action === 'edit') return rank >= 2;
  if (action === 'admin') return rank >= 3;
  throw new Error(`Unknown action: ${action}`);
}

// --- review comments ---------------------------------------------------------

export function createReview() {
  return { comments: [] };
}

export function addComment(review, { author, position = null, text }) {
  if (!text || !String(text).trim()) throw new Error('Comment text required.');
  const comment = {
    id: `c${review.comments.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    author: String(author || 'anon'), position, text: String(text).slice(0, 2000),
    resolved: false, createdAt: Date.now(),
  };
  review.comments.push(comment);
  return comment;
}

export function resolveComment(review, id, resolved = true) {
  const comment = review.comments.find((c) => c.id === id);
  if (!comment) throw new Error(`Unknown comment: ${id}`);
  comment.resolved = resolved;
  return comment;
}

export function openComments(review) {
  return review.comments.filter((c) => !c.resolved);
}
