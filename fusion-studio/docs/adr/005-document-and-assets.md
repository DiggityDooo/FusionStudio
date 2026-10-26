# ADR 005 — Versioned document and format registry

Status: proposed, not implemented. Current files remain version 1.

Choose a typed document independent of Three.js JSON with a versioned manifest and checksummed binary attributes. Renderer-only serialization couples persistence to a dependency's geometry constructors and scene conventions; the audit demonstrated a real loss of sculpt/UV data from generator recipes. The immediate repair serializes actual buffers but is not the future document migration.

Stable IDs unify scene nodes, topology, animation targets, constraints, patterns and history. Record units and axis conversions once at import boundaries. Resource tables allow shared meshes/materials without duplicated payloads. Store patterns/seams/fabric independently from triangulated cloth. Preserve editable and evaluated states separately. Migration retains v1 files and unknown extension metadata; unsupported features produce a report.

One importer/exporter registry declares read/write capabilities and per-feature exact/approximate/dropped/unsupported outcomes. Preflight shares the compatibility rules used by operators. Keep direct DSON's confinement, expansion limits and dependency hashes. Native CC/MD and protected data remain explicitly unsupported unless a permitted, verified route is established; independent equivalent tools remain on the roadmap. No format extension alone implies support.

Fixtures: legacy v0.1, v0.2 character/cloth/timeline, edited primitive, shared resources, external texture rejection, truncated resource, unknown schema and failed migration without source mutation. Later plugins use versioned registries for operators/panels/importers/node types; external plugin loading is not included in this first phase.
