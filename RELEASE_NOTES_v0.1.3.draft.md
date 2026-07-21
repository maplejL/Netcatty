# Netcatty fork v0.1.3

**Tag:** `v0.1.3`  
**Branch:** `feature/ops_ai_enhancements`（本 fork 开发主线；不合并到 `main`）  
**Date:** 2026-07-21

## Highlights

### Terminal UX
- Ctrl+C always scrolls to the bottom (independent of “scroll on key press”).
- Session restore defaults to restoring the terminal CWD.
- Work tabs can sit on the top, left, or right (Appearance settings).

### AI / external agents
- **Cursor:** Fast toggle + effort chip next to the model picker; model params are applied on `send`.
- **Fix:** Cursor SDK defaults to the Fast variant when `fast` is omitted — Netcatty now sends `fast=false` unless Fast is on (stops usage showing as `*-low-fast`).
- **Codex:** Fast maps to `minimal`; effort levels `low/medium/high/xhigh`.
- **CodeBuddy / WorkBuddy:** Fast disables thinking; effort chip for `adaptive` / `enabled`.

## Install (Windows x64)

Prefer the NSIS installer. After install, fully quit and relaunch once if you previously hot-swapped `app.asar`.

## Notes

- This release line is the **fork** (maplejL/Netcatty), not upstream binaricat auto-releases.
- Development continues on `feature/ops_ai_enhancements` only; `main` stays at the earlier merge snapshot by policy.

## Full changelog

See `CHANGELOG.md` → `[0.1.3]`.
