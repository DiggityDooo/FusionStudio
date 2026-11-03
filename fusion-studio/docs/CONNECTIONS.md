# Models, chat and MCP

Open **Models & Connections** from top menu. Connections persist separately from `.fusion` documents. Model runtimes, weights, accounts and keys are user supplied.

## Profiles and chat

| Adapter | Base URL example | Model |
|---|---|---|
| Native Ollama | `http://127.0.0.1:11434` | Installed model such as `phi3:mini` |
| OpenAI-compatible | `http://127.0.0.1:11434/v1` | Model served by compatible endpoint |

Save profile, test connection, then send a message. Optional API key uses Electron safeStorage. Blank key retains existing stored key; Remove stored key clears it. Profile responses do not return stored keys. Cancel aborts active request; Clear removes conversation from memory. Chat transmits entered messages only and does not automatically execute scene edits. Other provider protocols require compatible gateways.

**Verified November 3:** packaged 0.19.0-rc.1 with local Ollama 0.40.13 and `phi3:mini`; native and compatible routes both return real model text. Cancellation, profile persistence across restart and real missing-model error pass. [Sanitized results](verification/2026-11-03-live-connections.json) retain prompts, replies, version and model digest. This verifies one local provider/model through two protocols; cloud providers and other installed models remain unverified.

## MCP server

MCP is disabled by default. Enable local server, choose port (default **39157**) and copy client configuration. Toggle **Allow scene edits** only when external client should edit this fresh/current project. Keep copied configuration private: it contains bearer credential.

Endpoint uses authenticated Streamable HTTP on `127.0.0.1`, with Origin/Host validation. App must remain open. Each write requires current `projectId` and `revision` from inspection or preceding result.

| Tool | Behavior |
|---|---|
| `scene_inspect` | Read scene hierarchy, transforms and capabilities |
| `selection_inspect` | Read selection and revision |
| `selection_set` | Select object by UUID |
| `primitive_add` | Add allowlisted primitive as undoable operation |
| `object_transform` | Set position (meters), rotation (degrees) or scale component |
| `history_undo` / `history_redo` | Recover through shared history |

Existing validation, compatibility checks and editing locks remain active. Stale revisions, incompatible edits, disabled editing and concurrent operations reject. No arbitrary Python/shell/filesystem tool is exposed.

**Independent client verification:** official MCP Inspector 2.13.0 discovers seven tools and actually invokes all seven against running packaged app. Added cube, moved X to 2, undo restored X to 0, redo restored X to 2. Authentication and invalid Origin reject. Earlier [release gates](releases/2026-11-03-rc-report.md) also cover stale/invalid/concurrent/read-only behavior through official SDK client.

Recorded demo uses a separate external SDK client. Internal chat remains conversational; automatic scene agent and connections to external MCP servers are deferred.

Primary protocol references: [Ollama chat](https://docs.ollama.com/api/chat), [compatible API](https://docs.ollama.com/api/openai-compatibility), [MCP Inspector](https://github.com/modelcontextprotocol/inspector), [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage/).
