# ADR 003 — Operators and compatibility

Status: initial proof implemented in 0.3.0. Five action families are routed; complete action migration, typed plugin schema and generic transaction rollback remain pending. F9 currently adjusts transforms only.

Choose one dispatcher shared by menus, F3, shortcuts and gestures rather than maintaining separate event handlers. The contract is in ARCHITECTURE.md. Typed properties, poll, fidelity rules, transaction/undo policy, execution class and progress/cancel are mandatory metadata. Existing tools migrate through adapters before old handlers are removed.

A warning cannot be a UI-only concern. The dispatcher preflights the exact document revision and selected IDs; a mutation after preflight requires revalidation. Modal dismissals resolve Cancel. Fixes on copies are part of the transaction. A blocker cannot be suppressed. Export and render can be non-mutating operators: undo does not delete files.

Five-action proof: object transform (one command per drag), add primitive, selected region extrude, Undo and Render. Render delegates only after preflight and publishes a new artifact. Extrusion may temporarily use a compressed geometry snapshot; do not label that delta undo. Test all routes call the same operator, rejected poll and Cancel do not execute, exceptions roll back, redo-last replaces from its original input, and New/Open cannot invalidate an in-flight write.
