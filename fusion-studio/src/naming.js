'use strict';
// Scene naming conventions and validation (A26 "Naming conventions and
// validation tools"). Rules are data: per-category regex patterns,
// required affixes, forbidden characters, and case style. Validation
// reports every issue with a concrete fix suggestion; applyFixes
// produces a renamed object list that is guaranteed valid and unique
// under the same rules (or throws explaining why it cannot be).

export const DEFAULT_RULES = {
  forbiddenChars: /[^A-Za-z0-9_.\-:]/g,
  categories: {
    mesh: { pattern: /^[A-Z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/, suffix: '_GEO', example: 'Chair_GEO' },
    material: { pattern: /^[A-Z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/, suffix: '_MAT', example: 'Wood_MAT' },
    bone: { pattern: /^[a-z][A-Za-z0-9]*(_[a-z0-9]+)*$/, suffix: '', example: 'spine_01' },
    light: { pattern: /^[A-Z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/, suffix: '_LGT', example: 'Key_LGT' },
    camera: { pattern: /^[A-Z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/, suffix: '_CAM', example: 'Hero_CAM' },
    other: { pattern: /^[A-Za-z][A-Za-z0-9_.\-]*$/, suffix: '', example: 'Group1' },
  },
};

function categoryOf(obj, rules) {
  return rules.categories[obj.type] ? obj.type : 'other';
}

function baseName(name) {
  // Duplicate suffixes look like "Name.001" (Blender-style).
  return name.replace(/\.\d{3}$/, '');
}

/** Validate a scene object list [{name, type}]. Returns issue list. */
export function validateNames(objects, rules = DEFAULT_RULES) {
  const issues = [];
  const seen = new Map();
  for (const obj of objects) {
    if (seen.has(obj.name)) {
      issues.push({ name: obj.name, rule: 'unique', message: `duplicate name (also used by ${seen.get(obj.name)})`, fix: null });
    } else {
      seen.set(obj.name, obj.type);
    }
    const cat = rules.categories[categoryOf(obj, rules)];
    const stripped = obj.name.replace(rules.forbiddenChars, '');
    if (stripped !== obj.name) {
      issues.push({ name: obj.name, rule: 'charset', message: `contains characters outside [A-Za-z0-9_.-:]`, fix: stripped || 'Unnamed' });
    }
    if (!cat.pattern.test(baseName(obj.name))) {
      issues.push({ name: obj.name, rule: 'pattern', message: `does not match ${categoryOf(obj, rules)} convention (e.g. ${cat.example})`, fix: null });
    }
    if (cat.suffix && !baseName(obj.name).endsWith(cat.suffix)) {
      issues.push({ name: obj.name, rule: 'suffix', message: `${categoryOf(obj, rules)} names must end with '${cat.suffix}'`, fix: baseName(obj.name) + cat.suffix });
    }
  }
  return issues;
}

/** Blender-style unique name: Name, Name.001, Name.002, ... */
export function makeUnique(name, taken) {
  if (!taken.has(name)) return name;
  const base = baseName(name);
  for (let i = 1; ; i++) {
    const candidate = `${base}.${String(i).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Sanitize one name toward its category convention: strip forbidden
 * chars, title-case the first letter for capitalized categories,
 * ensure the suffix. Does not dedupe -- pair with makeUnique.
 */
export function sanitizeName(name, type, rules = DEFAULT_RULES) {
  const cat = rules.categories[type] ? rules.categories[type] : rules.categories.other;
  let out = baseName(String(name));
  // Case first: a lowercase-only charset would otherwise eat the capital.
  if (cat.pattern.source.startsWith('^[A-Z')) out = out.charAt(0).toUpperCase() + out.slice(1);
  if (cat.pattern.source.startsWith('^[a-z')) out = out.charAt(0).toLowerCase() + out.slice(1);
  out = out.replace(rules.forbiddenChars, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!out) out = 'Unnamed';
  if (cat.suffix && !out.endsWith(cat.suffix)) out += cat.suffix;
  return out;
}

/**
 * Rename a whole scene to a valid, unique state. Returns
 * [{oldName, newName, type}] in input order. Renames are stable:
 * already-valid unique names are kept unchanged.
 */
export function applyFixes(objects, rules = DEFAULT_RULES) {
  const taken = new Set();
  return objects.map((obj) => {
    const type = obj.type || 'other';
    let candidate = obj.name;
    const issues = validateNames([obj], rules).filter((i) => i.rule !== 'unique');
    if (issues.length > 0) candidate = sanitizeName(obj.name, type, rules);
    candidate = makeUnique(candidate, taken);
    // A uniquified duplicate keeps its pattern validity: '.NNN' is
    // stripped by baseName during validation, so this stays valid.
    taken.add(candidate);
    return { oldName: obj.name, newName: candidate, type };
  });
}
