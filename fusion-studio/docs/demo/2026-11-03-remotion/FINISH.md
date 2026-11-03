# Final checks — November 3, 2026

Final film: **120.000 seconds, 3,600 decoded frames, 1920 × 1080, 30 fps, H.264 + AAC**. Decoded stereo audio: **120.000 seconds**. Integrated loudness **−14.07 LUFS**, true peak **−4.15 dBTP**. Seven MP4 container chapters and 17 English caption cues.

SHA-256: `e059d2518827c7dde67a7bcb62d9645d1ae0a41f0fad080fc93ad2b36ee8b0d4`.

Codex inspected 21 full-resolution beginning/middle/end stills and six 16-frame transition strips. Compatibility dialogs, output states, caption margins and intentional montage crops reviewed. Import/render waits shortened with visible labels. Captures retain actual input and output pixels; no credentials or personal file paths appeared in inspected frames. [Review hashes](qa-review.json) identify exact reviewed evidence. [Transition strips](qa/) remain available; full stills stay in local QA folder and can be regenerated.

Six representative frame pairs rendered independently twice with identical decoded RGBA hashes on this Windows host. [Determinism results](determinism.json) establish same-host repeatability, not cross-platform GPU identity. Full final film decoded without errors. [Seven captured GLB files](export-validation.json), including final sculpt export, pass official glTF validator with zero errors/warnings.

All six internal section boundaries lie on measured 100 BPM grid within one frame; endpoint remains exactly two minutes. Music uses first two minutes of supplied Secret recording at original speed, with opening/closing fades. Original audio file remains unchanged and outside repository.

Capture checks cover Blender editable/preserved import, native OptiX render, DAZ mesh/rig and supported material transaction, exact sculpt history, exact reopened geometry, actual export, actual local model response and revision-checked external MCP edits. DAZ color recovery maximum error **1.017e-6**, bounded by **1e-5**, with exact decoded texture pixels. Legacy 3Delight black-texture shader reconstruction remains excluded.

Frozen application ASAR remains `49f10f486e9e118d73e8b1af3ef76c585ae0a399b2e9a1aa501e4b33ac5a12f8`. Original 86-second demo and pre-existing dirty notes match pre-implementation hashes. [Verification](verification.json), [provenance](provenance.json), and [artifact hashes](media-inventory.json) provide machine-readable evidence.
