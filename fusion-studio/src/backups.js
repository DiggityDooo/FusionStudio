'use strict';
// Auto-backup and recovery policy (A26 "Auto-backup and recovery").
// Pure policy over an injected store ({list, write, read, remove}), so
// the same logic runs against the filesystem in the app and an
// in-memory store in tests. Each backup is an envelope with a checksum;
// recovery verifies checksums newest-first and falls back past
// corrupted backups instead of failing on the newest one.

function checksum(text) {
  // FNV-1a 32-bit: cheap tamper/corruption detection (not crypto).
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 'Scene_2026-10-27T14-30-05.fsn.bak' -- sortable, filesystem-safe. */
export function backupName(project, date) {
  const iso = date.toISOString().replace(/:/g, '-').replace(/\..*$/, '');
  return `${project}_${iso}.fsn.bak`;
}

export function parseBackupName(name) {
  const m = String(name).match(/^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.fsn\.bak$/);
  if (!m) return null;
  return { project: m[1], timestamp: m[2].replace(/-/g, (ch, i) => (i > 9 ? ':' : '-')) };
}

function timestampOf(name) {
  const m = String(name).match(/_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.fsn\.bak$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * Rotation plan for one project's backup filenames: keep the newest
 * `keepCount`, plus the newest backup of each of the last `keepDays`
 * UTC days; everything else is deleted. Non-backup names are ignored.
 */
export function planRotation(names, { keepCount = 5, keepDays = 7 } = {}) {
  const entries = names
    .map((name) => ({ name, t: timestampOf(name) }))
    .filter((e) => e.t !== null)
    .sort((a, b) => b.t - a.t);
  const keep = new Set();
  entries.slice(0, keepCount).forEach((e) => keep.add(e.name));
  if (entries.length > 0 && keepDays > 0) {
    const newestDay = Math.floor(entries[0].t / 86400000);
    const seenDays = new Set();
    for (const e of entries) {
      const day = Math.floor(e.t / 86400000);
      if (newestDay - day < keepDays && !seenDays.has(day)) {
        seenDays.add(day);
        keep.add(e.name);
      }
    }
  }
  return {
    keep: entries.filter((e) => keep.has(e.name)).map((e) => e.name),
    delete: entries.filter((e) => !keep.has(e.name)).map((e) => e.name),
  };
}

export function createBackupManager(store) {
  for (const method of ['list', 'write', 'read', 'remove']) {
    if (typeof store[method] !== 'function') throw new Error(`backups: store needs ${method}()`);
  }

  function projectBackups(project) {
    return store.list()
      .filter((name) => {
        const parsed = parseBackupName(name);
        return parsed && parsed.project === project;
      })
      .sort((a, b) => timestampOf(b) - timestampOf(a));
  }

  /** Write a checksummed backup; returns its name. */
  function backup(project, payloadText, date = new Date()) {
    const name = backupName(project, date);
    const envelope = JSON.stringify({ checksum: checksum(payloadText), payload: payloadText });
    store.write(name, envelope);
    return name;
  }

  /** Apply rotation for one project; returns the plan that was applied. */
  function rotate(project, options) {
    const plan = planRotation(projectBackups(project), options);
    for (const name of plan.delete) store.remove(name);
    return plan;
  }

  /**
   * Newest valid payload for a project. Corrupted backups (bad JSON or
   * checksum mismatch) are skipped; returns {name, payload} or null,
   * plus the list of skipped corrupted names.
   */
  function restoreLatest(project) {
    const skipped = [];
    for (const name of projectBackups(project)) {
      try {
        const envelope = JSON.parse(store.read(name));
        if (checksum(envelope.payload) !== envelope.checksum) throw new Error('checksum mismatch');
        return { name, payload: envelope.payload, skipped };
      } catch {
        skipped.push(name);
      }
    }
    return { name: null, payload: null, skipped };
  }

  return { backup, rotate, restoreLatest, projectBackups };
}

/** In-memory store for tests and headless use. */
export function createMemoryStore() {
  const files = new Map();
  return {
    list: () => [...files.keys()],
    write: (name, text) => files.set(name, String(text)),
    read: (name) => {
      if (!files.has(name)) throw new Error(`backups: no file '${name}'`);
      return files.get(name);
    },
    remove: (name) => files.delete(name),
    _files: files,
  };
}
