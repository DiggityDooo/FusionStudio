# Contributing to Fusion Studio

Start with [current scope](README.md), [architecture](fusion-studio/ARCHITECTURE.md), [tests](fusion-studio/docs/TESTING.md) and [format limits](fusion-studio/docs/releases/2026-11-03-rc-guide.md). Candidate source lives on `codex/overnight-rc1` until reviewed into `main`.

## Development

Use Windows x64, Node.js 22+, Python 3 and Blender 5.2 for the verified desktop route. Install a compatible Rust/GNU Windows toolchain for the native helper; [build-native.ps1](fusion-studio/scripts/build-native.ps1) uses workspace-local tools when present, otherwise tools on `PATH`.

```powershell
cd fusion-studio
npm ci
npm run build:native
npm run build
npm start
```

Public character foundations require separate local preparation; [asset and dependency records](fusion-studio/docs/DEPENDENCIES.md) explain sources and notices. Do not substitute private commercial content in committed fixtures.

## Changes and review

- Keep one feature or repair per commit. Push feature updates to a `codex/` branch.
- Preserve existing dirty work, original assets, installed hosts and earlier releases.
- Use existing operators, transactions, compatibility checks and revision-aware workers. A rejected or cancelled edit must preserve scene and history.
- Describe supported fidelity and remaining limits. Loading a file does not prove editable native parity.
- Run focused checks appropriate to the change. Use full release gates for changes to candidate runtime; document any missing host or fixture rather than treating it as a pass.
- Include reproduction steps and measured evidence in the pull request. Documentation-only changes need repository/link checks, not a claim that the full native corpus was rerun.

## Data boundaries

Keep model credentials, MCP bearer tokens, user profiles, paid/private assets, generated builds, test-output and compiler downloads outside Git. New public media must have provenance, hashes and a current capture manifest. Screenshots/video must show actual application output; label chapter cuts and automation accurately.

[MIT license](LICENSE) applies to original project code. Third-party components and assets retain their own terms and notices.
