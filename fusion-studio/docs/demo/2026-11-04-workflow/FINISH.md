# Continuous workflow — delivery audit

- Fusion 0.19.0-rc.1; fresh app data, visible packaged executable.
- 243.633 seconds; 7,309 fully decoded frames; 1920 × 1080, 30 fps, H.264, silent.
- One recording start/stop; normal speed; all waits retained; eleven embedded chapters and English VTT captions.
- 4,780 native timestamped source frames, normalized to 30 fps without retiming actions.
- Actual import, native wireframe, transform, undo/redo, disk reopen, export, lighting and Cycles/OptiX result checked.
- Canonical geometry and scene recovery digests match. Independent GLB check: 0 errors, 1 documented warning. Static prop scope.
- Three independent representative frame pairs match exact RGBA pixels. Visual audit: 32 images; see [review notes](qa-review.json).
- Frozen ASAR, original source, cinematic trailer and five protected baseline files unchanged. Private inputs and raw captures remain local.
- Video SHA-256: `ca9e95e258407ba969ede194f7fe290843c9bbd5d2cb458878f75e014992ad37`.
- Cinematic trailer SHA-256: `a8ca72b48592cb9cc20493013eb6da1db08ad2fa984ffe9d70d1fe78e59bad5e`.

[Known limits and reproduction](README.md) · [Technical checks](verification.json) · [Independent export check](export-validation.json) · [Preservation](preservation.json)
