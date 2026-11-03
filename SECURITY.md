# Security and local data

Fusion Studio is a local Windows release candidate. Report suspected credential exposure or code-execution issues privately to repository owner before posting reproductions. Use GitHub private vulnerability reporting when available; ordinary bugs can use the bug-report template.

Models & Connections brokers HTTP requests in Electron main process. API keys use Electron safeStorage and are excluded from profile-list responses and project documents. Chat sends entered conversation; it does not automatically upload a scene. Profiles belong to app data, separate from `.fusion` documents.

MCP is off by default, binds to `127.0.0.1`, requires a bearer credential and validates Origin/Host. Scene edits need an explicit enable switch, current project/revision, and existing operator locks/validation. Treat copied client configuration as a credential; do not commit it or show it in recordings.

Blender jobs run in isolated background profiles with source script execution disabled. Conversion/native rendering still depends on installed Blender and supported device drivers. Original files are retained; supported working copies have documented fidelity limits.

Use minimized, redistributable fixtures in public reports. Never attach private assets, provider keys, user-data folders or raw MCP client configuration. Dependency audit results and release test evidence are scoped observations, not a blanket security certification.

See [connections](fusion-studio/docs/CONNECTIONS.md) and [release limits](fusion-studio/docs/releases/2026-11-03-rc-report.md).
