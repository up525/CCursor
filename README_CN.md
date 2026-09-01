<p align="center">
  <a href="README.md">English</a> | 中文
</p>

<p align="center">
  <img src="ccursor.png" width="120" alt="Cursor++" />
</p>

<h1 align="center">Cursor++</h1>

<p align="center">
  <strong>Bring Your Own Key for Cursor IDE</strong><br/>
  使用自己的 API Key 驱动 Cursor 的 Agent / Chat / Composer
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cometix/ccursor"><img src="https://img.shields.io/npm/v/@cometix/ccursor" alt="npm" /></a>
  <a href="https://linux.do/t/topic/1926833"><img src="https://img.shields.io/badge/LinuxDO-Discussion-blue" alt="LinuxDO" /></a>
</p>

---

## What is Cursor++? / Cursor++ 是什么?

Cursor++ lets you use **your own LLM API keys** (Anthropic, OpenAI, Google Gemini, or any OpenAI-compatible provider) or an **OpenAI Codex ChatGPT login** with [Cursor IDE](https://cursor.com). It runs a local BYOK server inside Cursor's extension host, intercepts ConnectRPC/REST traffic, and routes LLM requests to your configured providers.

Cursor++ 让你使用**自己的 LLM API Key**（Anthropic / OpenAI / Google Gemini 或任何兼容服务商），也可以通过**官方 OpenAI Codex CLI 的 ChatGPT 登录态**驱动 [Cursor IDE](https://cursor.com)。它在 Cursor 扩展宿主内运行本地 BYOK 服务器，拦截 ConnectRPC/REST 通信并路由到你配置的服务商。

---

## Quick Start / 快速开始

```bash
# Install / 安装
npx @cometix/ccursor install

# Restart Cursor, then open the Cursor++ sidebar panel to configure providers
# 重启 Cursor，打开侧边栏 Cursor++ 面板配置服务商

# Optional: use a ChatGPT account through the official OpenAI Codex CLI
# 可选：通过官方 OpenAI Codex CLI 使用 ChatGPT 账号
npm install -g @openai/codex
codex login
# 在 Cursor++ 中新增 Provider，选择 "openai-codex (ChatGPT Auth)"

# Uninstall / 卸载
npx @cometix/ccursor uninstall

# Check installation status / 检查安装状态
npx @cometix/ccursor status
```

安装器无需 Cursor 账号即可直接开启本地 BYOK 模式。macOS 上，安装器会在打补丁
后对应用及其嵌套代码统一做本机临时签名（保留组件标识和 entitlements），并清除
下载隔离标记，避免 Gatekeeper 把已修改的应用误报为“已损坏”。

如果 Cursor 原本未登录，安装器会写入一个只在本地使用的合成 BYOK 身份，让输入框
不再出现登录门槛。已有的真实 Cursor 登录态绝不会被覆盖；卸载时也只会删除仍能明确
识别为 Cursor++ 创建的本地身份。

---

## Features / 功能特性

- **BYOK Mode Toggle** — Sidebar one-click switch between BYOK and official Cursor  
  **BYOK 模式开关** — 侧边栏一键切换 BYOK 和官方 Cursor

- **Multi-Provider** — Anthropic, OpenAI APIs, OpenAI Codex (ChatGPT Auth), Google Gemini, or any compatible endpoint
  **多服务商** — Anthropic、OpenAI API、OpenAI Codex（ChatGPT Auth）、Google Gemini 或任何兼容端点

- **Official OpenAI Auth Bridge** — Reuses the official Codex CLI login; Cursor++ never reads or stores ChatGPT OAuth tokens
  **官方 OpenAI Auth 桥接** — 复用官方 Codex CLI 登录态；Cursor++ 不读取、不保存 ChatGPT OAuth token

- **Full Agent Mode** — Tool calling, multi-turn conversations, auto-summarization, checkpoint persistence  
  **完整 Agent** — 工具调用、多轮对话、自动摘要、检查点持久化

- **Model Config UI** — Visual provider/model management with thinking level, context limits, variant display  
  **模型配置 UI** — 可视化服务商/模型管理，支持思考档位、上下文限制、变体显示

- **Error Banner** — LLM errors surface as Cursor's native retry banner with retryable/non-retryable classification  
  **错误横幅** — LLM 错误通过原生重试横幅展示，自动区分可重试/不可重试

- **Per-Window Logging** — Each window gets its own log stream, colored output in LogOutputChannel  
  **逐窗口日志** — 每个窗口独立日志流，LogOutputChannel 彩色输出

- **Hot-Reload** — Config changes take effect without restarting Cursor  
  **热重载** — 配置修改无需重启 Cursor 即可生效

- **22 Agent Tools** — Shell, Read, Grep, Glob, StrReplace, Write, Task, MCP, etc.  
  **22 个 Agent 工具** — Shell、Read、Grep、Glob、StrReplace、Write、Task、MCP 等

---

## How It Works / 工作原理

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
所有补丁创建备份文件，可通过 `uninstall` 完全还原。

---

## Configuration / 配置

Config files in `~/.ccursor/`:

| File | Purpose / 用途 |
|---|---|
| `providers.json` | LLM providers, API keys/auth mode, models / 服务商、密钥或认证方式、模型定义 |
| `routes.json` | BYOK toggle + redirect whitelist / BYOK 开关 + 重定向白名单 |
| `cursor.db` | Conversation persistence / 对话持久化 |

### Provider Example / 配置示例

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

### OpenAI Codex（ChatGPT Auth）配置示例

先安装官方客户端并登录：

```bash
npm install -g @openai/codex
codex login
codex login status
```

然后打开 Cursor++ 侧边栏：

1. 选择 `openai-codex (ChatGPT Auth)`。
2. 点击 **Check Login**。
3. 点击 **Fetch from Codex**。Cursor++ 会调用官方 Codex App Server 的
   `model/list`，因此结果与当前 ChatGPT 账号实际可见的模型一致。
4. 点击某个模型，或点击 **Add all**，然后保存 Provider。
5. 回到 Cursor 原生模型选择器，为每次请求自由选择模型以及该模型支持的思考层级。

项目不再固定写死某个版本的默认模型。Provider 初始模型列表为空，保存前由当前账号动态填充：

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

登录、token 刷新、安全存储和模型可用性都由官方 Codex 客户端负责。Cursor++ 只运行 `codex login status`、App Server 的 `model/list` 和 `codex exec`，不会打开 `~/.codex/auth.json`。如果 Cursor 自动找不到 CLI，可以在 Provider 中设置 `codexPath`。

---

## Platform / 平台支持

| Platform | Status |
|---|---|
| macOS (ARM / Intel) | ✅ |
| Linux | ✅ |
| Windows | ✅ |

需要 **Cursor IDE** + **Node.js >= 18**。使用 ChatGPT Auth Provider 时，还需要安装官方 **OpenAI Codex CLI**。

---

## Troubleshooting / 故障排除

| Issue / 问题 | Solution / 解决 |
|---|---|
| Cannot sign in after install / 安装后无法登录 | Toggle BYOK OFF in sidebar, then sign in / 侧边栏切 OFF 后登录 |
| Model not found / 模型未找到 | Add model in sidebar panel / 在面板中添加模型 |
| LLM 401/403/404 | Check API key & base URL in providers.json / 检查密钥和地址 |
| 找不到 OpenAI Codex | 安装 `@openai/codex`，或在 Provider 中设置 `codexPath` |
| OpenAI Codex 未登录 | 点击 **Sign in with ChatGPT**，完成 `codex login` 后点击 **Check Login** |

---

## Issues & Feedback / 问题与反馈

This repository is for **issue tracking and documentation only** — source code is not published.

本仓库仅用于**问题追踪和文档发布** — 源代码不公开。

- [Submit an Issue](https://github.com/CometixSpace/CCursor/issues)
- [LinuxDO Discussion](https://linux.do/t/topic/1926833)

---

<p align="center">
  <a href="https://linux.do/t/topic/1926833">LinuxDO</a> · <a href="https://www.npmjs.com/package/@cometix/ccursor">npm</a>
</p>
