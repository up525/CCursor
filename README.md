<p align="center">
  English | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="ccursor.png" width="120" alt="Cursor++" />
</p>

<h1 align="center">Cursor++</h1>

<p align="center">
  <strong>Bring Your Own Key for Cursor IDE</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cometix/ccursor"><img src="https://img.shields.io/npm/v/@cometix/ccursor" alt="npm" /></a>
</p>

---

## What is Cursor++?

Cursor++ lets you use **your own LLM API keys** (Anthropic, OpenAI, Google Gemini, or any OpenAI-compatible provider) or an **OpenAI Codex ChatGPT login** with [Cursor IDE](https://cursor.com). It runs a local BYOK server inside Cursor's extension host, intercepts ConnectRPC/REST traffic, and routes LLM requests to your configured providers.

---

## Quick Start

```bash
# Install
npx @cometix/ccursor install

# Restart Cursor, then open the Cursor++ sidebar panel to configure providers

# Optional: use a ChatGPT account through the official OpenAI Codex CLI
npm install -g @openai/codex
codex login
# In Cursor++: add a provider and select "openai-codex (ChatGPT Auth)"

# Uninstall
npx @cometix/ccursor uninstall

# Check installation status
npx @cometix/ccursor status
```

The installer enables local BYOK mode without a Cursor account. On macOS it
re-signs the modified app hierarchy locally, preserving component identifiers
and entitlements, then clears its download quarantine marker so Gatekeeper does
not misreport the patched app as damaged.

When Cursor is signed out, the installer creates a synthetic local-only BYOK
identity so the composer does not show a login gate. Existing real Cursor
sessions are never overwritten, and uninstall removes the synthetic identity
only when it is still recognisably Cursor++'s.

---

## Features

- **BYOK Mode Toggle** — Sidebar one-click switch between BYOK and official Cursor
- **Multi-Provider** — Anthropic, OpenAI APIs, OpenAI Codex (ChatGPT Auth), Google Gemini, or any compatible endpoint
- **Official OpenAI Auth Bridge** — Reuses the official Codex CLI login; Cursor++ never reads or stores ChatGPT OAuth tokens
- **Full Agent Mode** — Tool calling, multi-turn conversations, auto-summarization, checkpoint persistence
- **Model Config UI** — Visual provider/model management with thinking level, context limits, variant display
- **Error Banner** — LLM errors surface as Cursor's native retry banner with retryable/non-retryable classification
- **Per-Window Logging** — Each window gets its own log stream, colored output in LogOutputChannel
- **Hot-Reload** — Config changes take effect without restarting Cursor
- **22 Agent Tools** — Shell, Read, Grep, Glob, StrReplace, Write, Task, MCP, etc.

---

## How It Works

```
Cursor IDE
  │
  ├─ inject-patch (renderer)
  │   └─ intercept ConnectRPC + REST → route to BYOK server
  │
  ├─ always-local-patch (extension host)
  │   └─ rewrite http/https.request + hot-reload from routes.json
  │
  └─ Cursor++ Extension (BYOK Server @ 127.0.0.1:9960)
      ├─ Fastify + ConnectRPC (27 services)
      ├─ LLM: Anthropic / OpenAI / Gemini SDK + official Codex CLI
      ├─ Agent: multi-round tool-calling orchestrator
      └─ Config: ~/.ccursor/providers.json + routes.json
```

All patches create backup files and are fully reversible via `uninstall`.

---

## Configuration

Config files are stored in `~/.ccursor/`:

| File | Purpose |
|---|---|
| `providers.json` | LLM provider endpoints, API keys/auth mode, and model definitions |
| `routes.json` | BYOK mode toggle + redirect whitelist |
| `cursor.db` | Conversation persistence (SQLite) |

### Provider Example

```json
{
  "providers": [
    {
      "id": "my-anthropic",
      "name": "Anthropic",
      "type": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "auth": { "kind": "apiKey", "value": "sk-ant-..." },
      "models": [
        {
          "id": "claude-sonnet-4",
          "apiModel": "claude-sonnet-4-20250514",
          "displayName": "Claude Sonnet 4",
          "thinking": true,
          "thinkingLevel": "medium",
          "contextTokenLimit": 200000,
          "defaultOn": true
        }
      ]
    }
  ]
}
```

### OpenAI Codex (ChatGPT Auth) Example

First install and sign in with the official client:

```bash
npm install -g @openai/codex
codex login
codex login status
```

Then open the Cursor++ sidebar:

1. Select `openai-codex (ChatGPT Auth)`.
2. Click **Check Login**.
3. Click **Fetch from Codex**. Cursor++ calls the official Codex App Server
   `model/list` method, so the result matches the models visible to the current
   ChatGPT account.
4. Click one model, or **Add all**, then save the provider.
5. Use Cursor's normal model picker to choose the model and its supported
   reasoning effort for each request.

No release-specific model is hard-coded. A provider starts with an empty model
list and is populated from the current account:

```json
{
  "id": "openai-codex",
  "name": "OpenAI Codex (ChatGPT)",
  "type": "openai-codex",
  "baseUrl": "",
  "auth": { "kind": "codex", "value": "" },
  "models": []
}
```

Authentication, token refresh, secure storage, and model availability stay in the official Codex client. Cursor++ only runs `codex login status`, the App Server `model/list` method, and `codex exec`; it never opens `~/.codex/auth.json`. Set `codexPath` on the provider if Cursor cannot discover the CLI automatically.

---

## Platform Support

| Platform | Status |
|---|---|
| macOS (ARM / Intel) | ✅ |
| Linux | ✅ |
| Windows | ✅ |

Requires **Cursor IDE** + **Node.js >= 18**. The ChatGPT-auth provider additionally requires the official **OpenAI Codex CLI**.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Cannot sign in after install | Toggle BYOK OFF in sidebar panel, then sign in normally |
| Model not found | Add the model in the sidebar panel or edit `~/.ccursor/providers.json` |
| LLM 401/403/404 | Check API key and base URL in providers.json |
| OpenAI Codex not found | Install `@openai/codex`, or set `codexPath` in the provider |
| OpenAI Codex not logged in | Click **Sign in with ChatGPT**, finish `codex login`, then click **Check Login** |

---

## Issues & Feedback

This repository is for **issue tracking and documentation only** — source code is not published.

- [Submit an Issue](https://github.com/CometixSpace/CCursor/issues)
- [LinuxDO Discussion](https://linux.do/t/topic/1926833)

---

<p align="center">
  <a href="https://www.npmjs.com/package/@cometix/ccursor">npm</a>
</p>
