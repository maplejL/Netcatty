# Netcatty fork v0.1.6

**Tag:** `v0.1.6`  
**Branch:** `feature/ops_ai_enhancements`（本 fork 开发主线；不合并到 `main`）  
**Date:** 2026-08-17

Clean cherry-pick of upstream through **v1.1.79** (about 291 conflict-free commits), plus hole-fixes so the packaged app boots and terminals mount. Conflicted stacks were skipped, not force-merged.

## Highlights

### System
- GPU / NPU occupancy in the System panel (including Ascend 910B via CANN 24.x `npu-smi`).
- PVE CT disk overview shows ZFS / bind mounts.

### SSH
- System SSH Agent authentication.
- Configurable connection timeouts.
- MFA / EDR secondary-password modal; Duo Password+OTP multi-prompt prefill.

### SFTP
- Connected picker lists live terminal hosts and can reuse an existing SSH session (not sudo sessions).
- Hide file columns; conflict dialog; reliable recursive delete.
- Oversized `fastPut` chunks no longer corrupt uploads.
- EDR step-up auth can retry.

### AI
- One-click provider connection test in Settings.
- Anthropic Base URL appends `/v1` only when the value is a bare origin.
- External MCP for Codex / Claude / Cursor / Grok (write approvals work even if the Catty sidebar was never opened).

### Terminal
- Copy tab / split inherits the current CWD.
- Host startup command runs after session restore.
- Fullscreen-app context menu honors the setting; no autocomplete on the alternate screen.
- Search-highlight reset clears a leftover selection.
- Zmodem drag-and-drop keeps the overwrite target.

### Mosh
- MoshCatty pure Rust client (no Cygwin), with handshake / ConPTY fixes.

### Vault / snippets / settings
- Snippet find/replace, centered add/edit modal, bulk delete.
- Searchable font pickers and local CJK fonts.
- FreeBSD host icon; scripts side-panel UX polish.

### Fork hole-fixes (this line would not boot without them)
- Restored inherited-CWD consume path and the SFTP transfer scheduler.
- Removed a dangling tab-badge setter that blanked the window on launch.
- Restored `shouldMarkConnectAutomationConsumed` so terminals load instead of “Terminal could not load”.

## Not in this release (conflicted, skipped)

Clear-before-inject (#2962), Ports+Services, Vault copy-hostname, settings global search, clear-all session logs, scripts expand/delete-selected, CSV same-IP different groups, decrypt-failure poison guard.

## Install (Windows x64)

Prefer the NSIS installer. After install, fully quit (tray too) and relaunch once if you previously hot-swapped `app.asar`.

## Notes

- This release line is the **fork** (`maplejL/Netcatty`), not upstream binaricat auto-releases.
- Development continues on `feature/ops_ai_enhancements` only; `main` stays at the earlier merge snapshot by policy.

## Full changelog

See `CHANGELOG.md` → `[0.1.6]`.
