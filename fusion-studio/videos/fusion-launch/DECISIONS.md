# Decisions

- User selected two minutes; import/edit/AI coverage; premium readable design; captions without narration; Secret by ESPRIT 空想.
- Adapt demo-video-creator at 7947a8b4ee9b18c056945b16911bd229d9606251. Remotion replaces HyperFrames; no ElevenLabs calls or keys needed. Real output hook, short copy, deterministic camera, transition strips and finish audit retained.
- Frozen 0.19.0-rc.1 packaged app supplies capture. Private DAZ source and audio remain local. No runtime dependency changes.
- Original 86-second demo remains unchanged. Picture preview is explicitly marked while required music is absent. Final render requires supplied local audio; no substitute soundtrack.
- Source capture timestamps and playback rates remain in evidence; sped-up shots identify playback rate. No claims about real-time conversion/inference speed.
- DAZ black 3Delight preset exposes supported color channel in current reader. Its legacy black-texture shader channels are not reconstructed; original texture remains. Film demonstrates compatible transaction and recovery, not full 3Delight appearance parity. Texture recovery is pixel-exact; observed maximum linear-color roundtrip error is 1.017e-6 (capture bound 1e-5).

## Pascal cadence revision — November 3

User requested matching flow/cadence of pascalorg/editor lead demo and explicitly allowed replacing current film. Reference measured at 163.90 seconds: result-first short cuts, long stable explanatory middle, closing invitation. Adapt those proportions to existing 120-second/music/no-narration brief. Remove large cards, recurrent headline/footer and section fade-through-black. Use clean live output orbits, full UI proof, concise phrase captions and hard cuts. Pascal footage/presenter/audio are not reused.

Three new orbits captured from frozen packaged app with fresh user data. Source sculpt GLB matched original verified export; DAZ bone count remains 24. Native image copied from actual previously verified Cycles job. Viewport captures exceed output dimensions and downsample to 1080p. New film replaces prior two-minute artifact in place; original 86-second baseline and runtime remain unchanged.

Final picture review fixes: sculpt undo/redo captions aligned to source frames 329/404; MCP captions aligned to actual add/transform/history frames; DAZ trim changed to source 4.10–5.35s compatibility view before import completion; closing output uses cover framing to remove letterbox seams; repeated end music line replaced with product description. Final audio credit remains in caption.

- Final visual audit: 43 full-resolution chapter/shot stills and 24 sixteen-frame strips passed. All 21 editorial cuts follow measured beat grid; three source wait cuts retain authentic import population. Current film replaced in place per user direction.
- Windows remux: final render completed but in-process chapter output open failed. Standalone remux after renderer exit passed. Package render command now sequences separate Node processes; render:chapters supports recovery without re-rendering frames.

- User rejected previous cut as insufficiently flashy. Rebuilt as 39-shot launch trailer with masked large type, fan-out asset cards, diagonal light reveals, native/editable split comparisons, focused UI push-ins and paper-white undo accents. Real footage and operation order retained; 120-second soundtrack scope unchanged. Pascal proportions no longer control opening duration after explicit user feedback.
