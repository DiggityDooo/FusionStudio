# A29 product configurator rule engine (2026-10-27)

Kernel: `src/configurator.js`. Tests:
`tests/configurator.test.mjs` (4/4).

Variant logic for product configurators: option groups with
per-option prices, `requires` and `excludes` rules, and a base
price. `validateConfiguration` reports missing groups, unknown
options, and rule violations; `resolveConfiguration` completes a
partial selection deterministically (declared order) or returns
null when impossible; `enumerateConfigurations` lists every valid
configuration; `allowedOptions` answers the existential question
per group (which options survive in some completion);
`configurationPrice` sums base + options and refuses invalid
selections.

Oracles are hand-counted catalogs: the car catalog (red excludes
leather, sport wheels require leather) enumerates to exactly the
4 valid combinations in declared order; sport wheels force
leather and therefore blue; red + sport is impossible; the PC
catalog's chained requires (GPU → PSU → case) resolve
transitively and enumerate to exactly 4. (One hand count in the
test initially said 5 — the kernel's 4 was right; basic+w850+mid
is also invalid.)

Limits: exhaustive backtracking search (guarded by an
enumeration limit), two rule types only, no option-group
dependencies beyond requires/excludes, no rendered variant
output (this is the logic core, not the viewer).
