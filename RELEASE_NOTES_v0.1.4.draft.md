# Netcatty fork v0.1.4

**Tag:** `v0.1.4`  
**Branch:** `feature/ops_ai_enhancements`?? fork ????????? `main`?  
**Date:** 2026-07-27

## Highlights

### Terminal and clipboard
- Terminal paste now defaults to `Ctrl+V`; SFTP file paste uses `Ctrl+Shift+V`.
- Improved clipboard access when terminal focus or Chromium shortcut handling prevents the normal path.
- Improved terminal selection copy, multiline paste, and interrupt handling.
- Fixed Bash `Esc + .` history argument extraction and autocomplete residue.

### AI and remote execution
- Detects interactive CLI prompts and avoids leaving AI commands waiting for stdin.
- Quarantines sessions stuck in interactive prompts so later commands are not consumed as field values.
- Fixed Netcatty CLI `exec` / `job-start` RPC failures caused by `sessions is not defined`.
- Updated agent guidance to prefer non-interactive command flags.

### Settings
- Keeps the settings window opaque and fixes the Default Agent selector showing content from the main window behind it.

## Install (Windows x64)

Prefer the NSIS installer. After install, fully quit and relaunch once if you previously hot-swapped `app.asar`.

## Notes

- This release line is the **fork** (`maplejL/Netcatty`), not upstream binaricat auto-releases.
- Development continues on `feature/ops_ai_enhancements` only; `main` stays at the earlier merge snapshot by policy.
