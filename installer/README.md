# @cometix/ccursor

Cursor++ BYOK Installer — Bring Your Own Key for Cursor IDE.

## Install

```bash
npx @cometix/ccursor install
```

For a downloaded GitHub Release package:

```bash
npm install -g ./cometix-ccursor-0.0.17.tgz
ccursor install
```

The installer enables BYOK without requiring a Cursor login. On macOS it also
re-signs the modified app hierarchy locally while preserving component
identifiers and entitlements, then removes its download quarantine marker to
prevent the misleading "app is damaged" Gatekeeper alert.

If Cursor is signed out, installation seeds a synthetic local-only BYOK
identity so the composer has no login gate. Existing real Cursor sessions are
preserved, and uninstall removes only an identity that is still recognisably
Cursor++'s.

To use the OpenAI Codex (ChatGPT Auth) provider, install the official client,
run `codex login`, choose `openai-codex (ChatGPT Auth)`, then use **Fetch from
Codex** to add the models and reasoning levels available to that account.

## Uninstall

```bash
npx @cometix/ccursor uninstall
```

## Status

```bash
npx @cometix/ccursor status
```
