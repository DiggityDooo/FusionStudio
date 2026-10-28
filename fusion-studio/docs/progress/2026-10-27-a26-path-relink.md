# A26 sub-asset packaging & path relinking — 2026-10-27

## Kernel

New `src/path-relink.js`: pure path math for moving projects between
machines and layouts (no filesystem access).

- `normalizePath`: forward slashes everywhere, `.`/`..` collapsed
  (absolute `..` clamps at the root, relative leading `..` preserved),
  drive letters retained. A drive-segment double-count during
  normalization was caught by the package-plan test and fixed.
- `makeRelative(fromDir, target)`: portable relative paths; cross-drive
  targets stay absolute rather than producing nonsense.
- `relinkPaths(paths, rules)`: longest whole-segment prefix rule wins
  (so `/old` never matches `/oldtex`), drive letters compare
  case-insensitively while the remainder stays case-sensitive.
  Unresolved paths and target collisions (two sources → one target)
  are reported, never silently overwritten.
- `planPackage`: rewrite under a new root, then relativize every
  target against the scene directory for a portable package.

## Verified (tests/path-relink.test.mjs, 5/5)

Normalization table including backslash Windows paths; relative-path
computation (siblings, descendants, cross-drive); longest-prefix and
segment-boundary matching with mixed-case drives; collision reporting
with both sources named; an end-to-end package plan with exact
absolute and relative outputs and the out-of-root path unresolved.

## Ledger

`A26 Sub-asset packaging and texture path relinking` gains
`tests/path-relink.test.mjs`. Stays partial: path planning is verified
— the actual file copying/packaging step is not wired. Backup
refreshed (test-output/kernel-backup-2026-10-27).
