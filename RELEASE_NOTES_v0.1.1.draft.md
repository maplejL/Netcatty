# Netcatty fork v0.1.1

**Tag:** `v0.1.1`  
**Branch:** `feature/ops_ai_enhancements`（本 fork 开发主线；不合并到 `main`）  
**Date:** 2026-07-17

## Highlights

### AI vision that actually works with OpenAI-compatible gateways
- Chat screenshots use model vision (no remote OCR / base64 tool detours).
- Context compression keeps image pixels.
- Outgoing chat bodies rewrite bare `image_url` base64 into `data:image/...;base64,...` so gateways stop returning `400 invalid-argument`.

### Side panel no longer freezes into a white screen
- Lazy-load boundary **Retry** remounts the panel instead of full `location.reload()`.
- Large image base64 is stripped when loading/saving AI sessions to localStorage.

### Terminal exec works again after upstream cherry-picks
- Define `closingTerminalSessions` so MCP `exec` / `job-start` no longer throw `ReferenceError`.
- SSH password-only path no longer references undefined `systemAuthAgent`.

### Upstream stability batch
~130 low-conflict commits from upstream since v0.1.0: terminal CWD/copy/reconnect, SSH latency and auth edge cases, system manager confirms, scripts reliability, packaging CI tweaks, and more.

## Install (Windows x64)

Prefer the NSIS installer. Portable / zip are also attached when built.

After install, fully quit and relaunch once if you previously hot-swapped `app.asar`.

## Notes

- This release line is the **fork** (maplejL/Netcatty), not upstream binaricat auto-releases.
- Development continues on `feature/ops_ai_enhancements` only; `main` stays at the v0.1.0 merge snapshot by policy.

## Full changelog

See [CHANGELOG.md](./CHANGELOG.md) section `[0.1.1]`.
