# Netcatty fork v0.1.2

**Tag:** `v0.1.2`  
**Branch:** `feature/ops_ai_enhancements`（本 fork 开发主线；不合并到 `main`）  
**Date:** 2026-07-21

## Highlights

### Daily efficiency
- Keep terminal tabs after disconnect / Ctrl+D (scrollback + reconnect).
- Insert SFTP paths into the terminal (middle-click / context menu, shell-quoted).
- More reliable SFTP follow of the active terminal CWD across multi-session same-host setups.

### Terminal UX
- Confirm and edit multi-line pastes before they hit the shell (setting on by default).
- Autocomplete popup stays clear of the active input line.

### SFTP / editor
- Remote “Edit” opens independent top-level editor tabs.
- Compare two editor tabs side-by-side from the tab context menu.
- Vault multi-select → batch SFTP upload the same local files to many SSH hosts.

### Cursor agent reliability
- Clearer Cursor turn errors (missing API key, status/code diagnostics).
- Call `run.wait()` and avoid unsafe System32 cwd for local Cursor agents.
- Update feed / publish config points at maplejL/Netcatty.

## Install (Windows x64)

Prefer the NSIS installer. Portable / zip are also attached when built.

After install, fully quit and relaunch once if you previously hot-swapped `app.asar`.

## Notes

- This release line is the **fork** (maplejL/Netcatty), not upstream binaricat auto-releases.
- Development continues on `feature/ops_ai_enhancements` only; `main` stays at the earlier merge snapshot by policy.

## Full changelog

See [CHANGELOG.md](./CHANGELOG.md) section `[0.1.2]`.
