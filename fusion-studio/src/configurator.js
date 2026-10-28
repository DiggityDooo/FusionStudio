'use strict';
// Product configurators (A29 "Product configurators and variant
// rendering"): a variant rule engine over option groups.
//   catalog: { basePrice?, groups: [{ id, options: [{ id,
//   price? }] }], rules: [...] }
//   rule: { type: 'requires', when: { group, option },
//           need: { group, option } }
//       | { type: 'excludes', a: { group, option },
//           b: { group, option } }   (symmetric)
// A selection is { groupId: optionId }. Enumeration order is the
// declared group/option order everywhere, so results are
// deterministic.

function optionExists(catalog, groupId, optionId) {
  const group = catalog.groups.find((g) => g.id === groupId);
  return !!group && group.options.some((o) => o.id === optionId);
}

function checkCatalog(catalog) {
  if (!catalog?.groups?.length) throw new Error('configurator: catalog needs option groups');
  const seen = new Set();
  for (const group of catalog.groups) {
    if (seen.has(group.id)) throw new Error(`configurator: duplicate group ${group.id}`);
    seen.add(group.id);
    if (!group.options?.length) throw new Error(`configurator: group ${group.id} needs options`);
  }
  for (const rule of catalog.rules || []) {
    const refs = rule.type === 'requires' ? [rule.when, rule.need] : rule.type === 'excludes' ? [rule.a, rule.b] : null;
    if (!refs) throw new Error(`configurator: unknown rule type ${rule.type}`);
    for (const ref of refs) {
      if (!optionExists(catalog, ref.group, ref.option)) {
        throw new Error(`configurator: rule references unknown option ${ref.group}/${ref.option}`);
      }
    }
  }
}

function ruleViolations(catalog, selection, { complete = true } = {}) {
  const violations = [];
  if (complete) {
    for (const group of catalog.groups) {
      if (!(group.id in selection)) violations.push(`missing selection for group ${group.id}`);
    }
  }
  for (const [groupId, optionId] of Object.entries(selection)) {
    if (!optionExists(catalog, groupId, optionId)) violations.push(`unknown option ${groupId}/${optionId}`);
  }
  for (const rule of catalog.rules || []) {
    if (rule.type === 'requires') {
      if (selection[rule.when.group] === rule.when.option
        && rule.need.group in selection
        && selection[rule.need.group] !== rule.need.option) {
        violations.push(`${rule.when.group}/${rule.when.option} requires ${rule.need.group}/${rule.need.option}`);
      }
    } else if (rule.type === 'excludes') {
      if (selection[rule.a.group] === rule.a.option && selection[rule.b.group] === rule.b.option) {
        violations.push(`${rule.a.group}/${rule.a.option} excludes ${rule.b.group}/${rule.b.option}`);
      }
    }
  }
  return violations;
}

/** Violations of a (possibly partial) selection; completeness optional. */
export function validateConfiguration(catalog, selection, { complete = true } = {}) {
  checkCatalog(catalog);
  return ruleViolations(catalog, selection, { complete });
}

/** Total price: base + chosen option prices. Requires a valid full selection. */
export function configurationPrice(catalog, selection) {
  const violations = validateConfiguration(catalog, selection);
  if (violations.length) throw new Error(`configurator: invalid configuration (${violations[0]})`);
  let total = catalog.basePrice ?? 0;
  for (const group of catalog.groups) {
    const option = group.options.find((o) => o.id === selection[group.id]);
    total += option.price ?? 0;
  }
  return total;
}

function consistentPartial(catalog, partial) {
  // Pairwise checks among assigned groups plus requires whose
  // target is already assigned (the DFS enforces the rest).
  return ruleViolations(catalog, partial, { complete: false }).length === 0;
}

function search(catalog, partial, { limit = 10000 } = {}) {
  const groups = catalog.groups;
  const results = [];
  const current = { ...partial };
  const dfs = (gi) => {
    if (results.length >= limit) return;
    if (gi === groups.length) {
      if (ruleViolations(catalog, current).length === 0) results.push({ ...current });
      return;
    }
    const group = groups[gi];
    if (group.id in current) {
      if (consistentPartial(catalog, current)) dfs(gi + 1);
      return;
    }
    for (const option of group.options) {
      current[group.id] = option.id;
      if (consistentPartial(catalog, current)) dfs(gi + 1);
      delete current[group.id];
      if (results.length >= limit) return;
    }
  };
  dfs(0);
  return results;
}

/** First completion of a partial selection in declared order, or null. */
export function resolveConfiguration(catalog, partial = {}) {
  checkCatalog(catalog);
  if (!consistentPartial(catalog, partial)) return null;
  const [first] = search(catalog, partial, { limit: 1 });
  return first ?? null;
}

/** Every valid complete configuration (throws past `limit`). */
export function enumerateConfigurations(catalog, { limit = 10000 } = {}) {
  checkCatalog(catalog);
  const results = search(catalog, {}, { limit: limit + 1 });
  if (results.length > limit) throw new Error(`configurator: more than ${limit} valid configurations`);
  return results;
}

/**
 * Options in `groupId` that appear in at least one completion of
 * the partial selection (existential check via search).
 */
export function allowedOptions(catalog, partial, groupId) {
  checkCatalog(catalog);
  const group = catalog.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`configurator: unknown group ${groupId}`);
  return group.options
    .filter((option) => search(catalog, { ...partial, [groupId]: option.id }, { limit: 1 }).length > 0)
    .map((option) => option.id);
}
