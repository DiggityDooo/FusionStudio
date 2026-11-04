# Final checks — November 4, 2026

Final film: **120.000 seconds, 3,600 decoded frames, 1920 × 1080, 30 fps, H.264 + AAC**. Decoded stereo audio: **120.000 seconds**. Integrated loudness **−14.07 LUFS**, true peak **−4.15 dBTP**. Seven MP4 container chapters and 40 English caption cues.

SHA-256: `a9e1b276fa1fc86f4e341b272f9f5748d8277d686d163d69496a80c04d7fb50e`.

Visual audit covers 60 full-resolution chapter/shot stills and 40 sixteen-frame transition strips. Codex inspected all 67 new or re-encoded images; 33 exact prior reviewed SHA-256 hashes carried forward. Compatibility dialogs, output states, caption margins and intentional montage crops reviewed. Import/render waits shortened with visible labels. Captures retain actual input and output pixels; no credentials or personal file paths appeared in inspected frames. [Review hashes](qa-review.json) identify exact reviewed evidence and prior audit. [Transition strips](qa/) remain available; full stills stay in local QA folder and can be regenerated.

Six representative frame pairs rendered independently twice with identical decoded RGBA hashes on this Windows host. [Determinism results](determinism.json) establish same-host repeatability, not cross-platform GPU identity. Full final film decoded without errors. [Seven captured GLB files](export-validation.json), including final sculpt export, pass official glTF validator with zero errors/warnings.

All 38 editorial shot boundaries lie on measured 100 BPM grid within one frame; two additional internal wait-removal cuts preserve operation order. Endpoint remains exactly two minutes. Music uses first two minutes of supplied Secret recording at original speed, with opening/closing fades. Original audio file remains unchanged and outside repository.

Capture checks cover Blender editable/preserved import, native OptiX render, DAZ mesh/rig and supported material transaction, exact sculpt history, exact reopened geometry, actual export, actual local model response and revision-checked external MCP edits. DAZ color recovery maximum error **1.017e-6**, bounded by **1e-5**, with exact decoded texture pixels. Legacy 3Delight black-texture shader reconstruction remains excluded.

Frozen application ASAR remains `49f10f486e9e118d73e8b1af3ef76c585ae0a399b2e9a1aa501e4b33ac5a12f8`. Original 86-second demo and pre-existing dirty notes match pre-implementation hashes. [Verification](verification.json), [provenance](provenance.json), and [artifact hashes](media-inventory.json) provide machine-readable evidence.

Launch revision follows updated user request for a flashy demo: 39 shorter shots, large masked type, fan-out cards, split comparisons, gold light reveals, focused UI push-ins and two paper-white undo accents. Opening runs 14.5 seconds; workflow sequence 87.6 seconds; recap/invitation 17.9 seconds. UI cuts retain visible footage while panels enter. Detail crops and playback speed are labeled. English VTT captions supply full context. Reference media remains outside delivery; no narrator or presenter added.

Windows chapter remux initially failed while renderer process retained handles; standalone remux after renderer exit passed. Render command now runs renderer and remux in separate processes. Final delivery decoded and verified after successful remux.

November 4 asset-variety revision: five repeated short shots and closing cards replaced. Four fresh captures supply 600 viewport frames: BMW shaded and elevated wireframe views, DAZ braided mesh hair rear view, elevated optics wireframe. Native wireframe toggle used; working-view visibility isolates BMW subject. BMW and DAZ input hashes remain unchanged. Original imported material approximations retained and disclosed; native shader parity remains outside film claims. Final file: 51,669,328 bytes.
