# Netcatty fork v0.1.5

**Tag:** `v0.1.5`  
**Branch:** `feature/ops_ai_enhancements`（本 fork 开发主线；不合并到 `main`）  
**Date:** 2026-08-14

## Highlights

### SFTP and sudo
- After interactive `sudo -i` / `su`, sidebar SFTP escalates and keeps following the elevated cwd.
- Hung `readdir` / channel-open calls time out and recover instead of spinning forever.
- A successful sudo connect is treated as elevated even if React state is still stale.

### Terminal and coding CLIs
- Remembers local coding CLI workdirs (Claude / Codex / Grok / etc.) with resume / continue / fresh jump.
- Scans in-app sessions and external processes (for example Grok in Windows Terminal).
- Top tabs and the focus sidebar show run phase: idle / running / waiting / completed / failed.
- Default wheel sensitivity is 0.5x so high-volume remote output is easier to read.

### AI and CLI
- Clears leftover Cursor runs before the next turn to avoid `AgentBusyError`.
- Vault Notes are available on the tool CLI (`list` / `get` / `create` / `update`); do not write remote `NOTES.md`.

### Settings
- System settings can persist app-wide TRACE logs under userData, with a retention period.

## Install (Windows x64)

Prefer the NSIS installer. After install, fully quit and relaunch once if you previously hot-swapped `app.asar`.

## Notes

- This release line is the **fork** (`maplejL/Netcatty`), not upstream binaricat auto-releases.
- Development continues on `feature/ops_ai_enhancements` only; `main` stays at the earlier merge snapshot by policy.

## Full changelog

See `CHANGELOG.md` → `[0.1.5]`.
