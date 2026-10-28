# A26 metadata / custom properties — 2026-10-27

## Kernel

New `src/custom-properties.js`: schema-typed custom property sets for
scene objects.

- Types: float, int, string, bool, color (0..1 RGB/RGBA), vec3, enum.
  Schemas are validated at construction (unknown types, enum without
  options, invalid defaults, duplicate names all throw).
- Writes are validated, never silently coerced: out-of-range numbers
  reject with precise messages unless the def opts into `clamp: true`.
- Values layer over schema defaults: `get` returns the effective
  value, `isSet`/`unset` manage the explicit layer, `effective()`
  flattens, and `toJSON` serializes only the explicit layer (round-trip
  verified through JSON).
- Array values are cloned on write and on read — no aliasing between
  caller arrays and stored state.
- `diffPropertySets` reports exactly the names whose effective values
  differ (array-aware comparison) for change tracking.

## Verified (tests/custom-properties.test.mjs, 7/7)

Default layering and unset restoration; the full type/range error
surface with state intact after failed writes; clamping behavior;
aliasing isolation both directions; explicit-layer-only serialization
with enum validation on load; exact diff output; schema
self-validation errors.

## Ledger

`A26 Metadata/custom properties` gains
`tests/custom-properties.test.mjs`. Stays partial: the property engine
is verified — scene objects and the inspector UI still need to adopt
it. Backup refreshed (test-output/kernel-backup-2026-10-27).
