"use strict";

/**
 * Enumerate external coding CLI processes (Windows Terminal, system shells, …)
 * so the renderer can merge them into Agent terminal history.
 *
 * Returns lightweight snapshots: { pid, name, commandLine, cwd? }.
 * Domain code decides which ones are valid history candidates.
 */

const { execFile } = require("node:child_process");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 8000;

const WINDOWS_CLI_BASENAMES = [
  "grok",
  "grok-build",
  "claude",
  "codex",
  "opencode",
  "gemini",
  "kimi",
  "moonshot",
  "droid",
  "factory",
  "copilot",
  "cursor",
  "codebuddy",
  "workbuddy",
  "deepseek",
  "ds",
];

function runExecFile(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...options.spawn,
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          error: err ? String(err.message || err) : null,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
        });
      },
    );
    // Extra safety: kill if still hanging past timeout (execFile timeout is soft on some platforms).
    if (options.timeoutMs) {
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }, options.timeoutMs + 500);
      child.on("exit", () => clearTimeout(timer));
    }
  });
}

function parseJsonArray(text) {
  let trimmed = String(text || "").trim();
  if (!trimmed) return [];

  // Prefer base64 UTF-8 payload from PowerShell (preserves CJK paths).
  const b64Match = trimmed.match(/NETCATTY_JSON_B64:([A-Za-z0-9+/=]+)/);
  if (b64Match?.[1]) {
    try {
      trimmed = Buffer.from(b64Match[1], "base64").toString("utf8").trim();
    } catch {
      /* fall through */
    }
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  } catch {
    // PowerShell sometimes emits BOM / trailing noise.
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function normalizeSnapshot(raw) {
  const pid = Number(raw?.pid ?? raw?.ProcessId ?? raw?.PID);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const name = typeof raw?.name === "string"
    ? raw.name
    : (typeof raw?.Name === "string" ? raw.Name : undefined);
  const commandLine = typeof raw?.commandLine === "string"
    ? raw.commandLine
    : (typeof raw?.CommandLine === "string" ? raw.CommandLine : undefined);
  const cwd = typeof raw?.cwd === "string"
    ? raw.cwd
    : (typeof raw?.Cwd === "string" ? raw.Cwd : undefined);
  return {
    pid,
    ...(name ? { name } : {}),
    ...(commandLine ? { commandLine } : {}),
    ...(cwd && cwd.trim() ? { cwd: cwd.trim() } : {}),
  };
}

/**
 * PowerShell: list matching processes + best-effort process cwd via PEB.
 * Cwd resolution is best-effort (access denied → omit).
 */
function buildWindowsScanScript(basenames) {
  const nameList = basenames.map((n) => n.toLowerCase()).join(",");
  // Keep script ASCII-only and self-contained. PEB walk may fail under limited rights.
  return `
$ErrorActionPreference = 'SilentlyContinue'
$names = @('${nameList.split(",").join("','")}')
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class NetcattyProcCwd {
  const uint PROCESS_QUERY_INFORMATION = 0x0400;
  const uint PROCESS_VM_READ = 0x0010;
  const int ProcessBasicInformation = 0;
  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_BASIC_INFORMATION {
    public IntPtr Reserved1;
    public IntPtr PebBaseAddress;
    public IntPtr Reserved2_0;
    public IntPtr Reserved2_1;
    public IntPtr UniqueProcessId;
    public IntPtr Reserved3;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct UNICODE_STRING {
    public ushort Length;
    public ushort MaximumLength;
    public IntPtr Buffer;
  }
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr read);
  [DllImport("ntdll.dll")]
  static extern int NtQueryInformationProcess(IntPtr h, int cls, ref PROCESS_BASIC_INFORMATION pbi, int len, out int ret);
  public static string GetCwd(int pid) {
    IntPtr h = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      PROCESS_BASIC_INFORMATION pbi = new PROCESS_BASIC_INFORMATION();
      int retLen;
      if (NtQueryInformationProcess(h, ProcessBasicInformation, ref pbi, Marshal.SizeOf(pbi), out retLen) != 0) return null;
      if (pbi.PebBaseAddress == IntPtr.Zero) return null;
      // PEB->ProcessParameters offset: 0x20 x64
      byte[] ptrBuf = new byte[IntPtr.Size];
      IntPtr read;
      IntPtr paramsAddrPtr = IntPtr.Add(pbi.PebBaseAddress, IntPtr.Size == 8 ? 0x20 : 0x10);
      if (!ReadProcessMemory(h, paramsAddrPtr, ptrBuf, ptrBuf.Length, out read)) return null;
      IntPtr processParameters = (IntPtr)(IntPtr.Size == 8 ? BitConverter.ToInt64(ptrBuf, 0) : BitConverter.ToInt32(ptrBuf, 0));
      if (processParameters == IntPtr.Zero) return null;
      // RTL_USER_PROCESS_PARAMETERS.CurrentDirectory.DosPath offset: 0x38 x64 / 0x24 x86
      IntPtr curDirPtr = IntPtr.Add(processParameters, IntPtr.Size == 8 ? 0x38 : 0x24);
      byte[] usBuf = new byte[Marshal.SizeOf(typeof(UNICODE_STRING))];
      if (!ReadProcessMemory(h, curDirPtr, usBuf, usBuf.Length, out read)) return null;
      ushort length = BitConverter.ToUInt16(usBuf, 0);
      IntPtr buffer = (IntPtr)(IntPtr.Size == 8 ? BitConverter.ToInt64(usBuf, 8) : BitConverter.ToInt32(usBuf, 4));
      if (buffer == IntPtr.Zero || length == 0 || length > 1024) return null;
      byte[] pathBuf = new byte[length];
      if (!ReadProcessMemory(h, buffer, pathBuf, pathBuf.Length, out read)) return null;
      string path = Encoding.Unicode.GetString(pathBuf);
      if (string.IsNullOrWhiteSpace(path)) return null;
      return path.TrimEnd('\\\\', '/', ' ');
    } catch { return null; }
    finally { CloseHandle(h); }
  }
}
"@
$out = New-Object System.Collections.Generic.List[object]
Get-CimInstance Win32_Process | ForEach-Object {
  $base = [IO.Path]::GetFileNameWithoutExtension($_.Name)
  if (-not $base) { return }
  $baseLower = $base.ToLowerInvariant()
  if ($names -notcontains $baseLower) { return }
  $cwd = $null
  try { $cwd = [NetcattyProcCwd]::GetCwd([int]$_.ProcessId) } catch { $cwd = $null }
  $out.Add([pscustomobject]@{
    pid = [int]$_.ProcessId
    name = $_.Name
    commandLine = $_.CommandLine
    cwd = $cwd
  })
}
$json = if ($out.Count -eq 0) { '[]' } else { ($out | ConvertTo-Json -Compress -Depth 3) }
$bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$json)
$b64 = [Convert]::ToBase64String($bytes)
Write-Output ("NETCATTY_JSON_B64:" + $b64)
`.trim();
}

async function listWindowsCodingCliProcesses() {
  const script = buildWindowsScanScript(WINDOWS_CLI_BASENAMES);
  const result = await runExecFile(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { timeoutMs: DEFAULT_TIMEOUT_MS },
  );

  if (!result.ok && !result.stdout.trim()) {
    // Fallback: CIM only (no cwd).
    return listWindowsCodingCliProcessesFallback();
  }

  return parseJsonArray(result.stdout)
    .map(normalizeSnapshot)
    .filter(Boolean);
}

async function listWindowsCodingCliProcessesFallback() {
  // No PEB — still useful when --cwd / resume is on the command line.
  const fallbackPs = `
$ErrorActionPreference='SilentlyContinue'
$items = Get-CimInstance Win32_Process | Where-Object {
  $b = [IO.Path]::GetFileNameWithoutExtension($_.Name).ToLowerInvariant()
  @(${WINDOWS_CLI_BASENAMES.map((n) => `'${n}'`).join(",")}) -contains $b
} | Select-Object @{n='pid';e={$_.ProcessId}}, @{n='name';e={$_.Name}}, @{n='commandLine';e={$_.CommandLine}}
$json = if (@($items).Count -eq 0) { '[]' } else { ($items | ConvertTo-Json -Compress) }
$bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$json)
Write-Output ("NETCATTY_JSON_B64:" + [Convert]::ToBase64String($bytes))
`.trim();
  const result = await runExecFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", fallbackPs],
    { timeoutMs: DEFAULT_TIMEOUT_MS },
  );
  return parseJsonArray(result.stdout)
    .map(normalizeSnapshot)
    .filter(Boolean);
}

async function listPosixCodingCliProcesses() {
  const result = await runExecFile(
    "ps",
    ["-A", "-o", "pid=,args="],
    { timeoutMs: DEFAULT_TIMEOUT_MS },
  );
  if (!result.ok) return [];

  const basenames = new Set(WINDOWS_CLI_BASENAMES);
  const out = [];
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const commandLine = m[2].trim();
    const first = commandLine.split(/\s+/)[0] || "";
    const base = path.basename(first).replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
    if (!basenames.has(base)) continue;

    let cwd;
    try {
      const lsof = await runExecFile("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
        timeoutMs: 1500,
      });
      const cwdLine = (lsof.stdout || "")
        .split("\n")
        .find((row) => row.startsWith("n"));
      if (cwdLine) cwd = cwdLine.slice(1);
    } catch {
      /* ignore */
    }

    out.push(normalizeSnapshot({ pid, name: base, commandLine, cwd }));
  }
  return out.filter(Boolean);
}

/**
 * @returns {Promise<{ processes: Array<{pid:number,name?:string,commandLine?:string,cwd?:string}>, error?: string }>}
 */
async function listExternalCodingCliProcesses() {
  const startedAt = Date.now();
  try {
    const platform = process.platform;
    console.info("[codingCliHistory:scan] bridge:list start", { platform });
    const processes = platform === "win32"
      ? await listWindowsCodingCliProcesses()
      : await listPosixCodingCliProcesses();
    console.info("[codingCliHistory:scan] bridge:list done", {
      ms: Date.now() - startedAt,
      count: processes.length,
    });
    return { processes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[codingCliHistory:scan] bridge:list failed", message);
    return {
      processes: [],
      error: message,
    };
  }
}

module.exports = {
  listExternalCodingCliProcesses,
  listWindowsCodingCliProcesses,
  listPosixCodingCliProcesses,
  WINDOWS_CLI_BASENAMES,
  // test helpers
  parseJsonArray,
  normalizeSnapshot,
};
