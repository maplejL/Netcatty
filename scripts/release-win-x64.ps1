# Fast Windows x64 fork release: vite + NSIS only (no portable/zip by default).
# Uploads only update-critical assets when -Upload is set: installer, blockmap, latest.yml.
#
# Usage:
#   .\scripts\release-win-x64.ps1
#   .\scripts\release-win-x64.ps1 -Full
#   .\scripts\release-win-x64.ps1 -SkipBuild
#   .\scripts\release-win-x64.ps1 -Upload -Tag v0.1.3
#   .\scripts\release-win-x64.ps1 -Full -Upload -Tag v0.1.3

param(
    [switch]$Full,
    [switch]$SkipBuild,
    [switch]$Upload,
    [string]$Tag = "",
    [switch]$AllowRunningApp
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Ensure-Monaco {
    $loader = Join-Path $repoRoot "public\monaco\vs\loader.js"
    if (Test-Path $loader) { return }
    $src = Join-Path $repoRoot "node_modules\monaco-editor\min\vs"
    if (-not (Test-Path $src)) {
        throw "Monaco source missing: $src (run npm install)"
    }
    Write-Host ">> copy monaco assets (PowerShell fallback)"
    $dstRoot = Join-Path $repoRoot "public\monaco"
    if (Test-Path $dstRoot) { Remove-Item $dstRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $dstRoot -Force | Out-Null
    Copy-Item -Path $src -Destination (Join-Path $dstRoot "vs") -Recurse -Force
    if (-not (Test-Path $loader)) { throw "Monaco copy failed: $loader" }
}

function Assert-AppNotRunning {
    $procs = Get-Process -Name "Netcatty" -ErrorAction SilentlyContinue
    if (-not $procs) { return }
    if ($AllowRunningApp) {
        Write-Warning "Netcatty is running; continuing because -AllowRunningApp was set."
        return
    }
    $ids = ($procs | Select-Object -ExpandProperty Id) -join ", "
    throw "Netcatty is running (pid: $ids). Quit the app first, or pass -AllowRunningApp."
}

$version = (Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json).version
if (-not $Tag) { $Tag = "v$version" }

$config = if ($Full) {
    "electron-builder.release-win-x64-full.cjs"
} else {
    "electron-builder.release-win-x64.cjs"
}

Write-Host ">> release Windows x64  version=$version  tag=$Tag  config=$config  full=$Full"

Assert-AppNotRunning

Write-Host ">> patch xterm webgl atlas isolation"
node scripts/patch-xterm-webgl-atlas.cjs
if ($LASTEXITCODE -ne 0) { throw "patch-xterm-webgl-atlas failed" }

Ensure-Monaco

if (-not $SkipBuild) {
    Write-Host ">> vite build"
    # Prefer direct vite to avoid flaky copy-monaco.cjs crash on some Windows hosts.
    npx --yes vite build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
}

$distLoader = Join-Path $repoRoot "dist\monaco\vs\loader.js"
if (-not (Test-Path $distLoader)) {
    throw "dist monaco missing after build: $distLoader"
}

$env:DEBUG = $null
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue

Write-Host ">> electron-builder ($config)"
npx --yes cross-env npm_config_arch=x64 NODE_OPTIONS=--disable-warning=DEP0190 `
    electron-builder --config $config --win --x64 --publish=never
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

$installer = Join-Path $repoRoot "release\Netcatty-$version-win-x64.exe"
$blockmap = Join-Path $repoRoot "release\Netcatty-$version-win-x64.exe.blockmap"
$latestYml = Join-Path $repoRoot "release\latest.yml"
foreach ($path in @($installer, $blockmap, $latestYml)) {
    if (-not (Test-Path $path)) { throw "Missing expected artifact: $path" }
}

Write-Host ">> artifacts"
Get-ChildItem (Join-Path $repoRoot "release") -File |
    Where-Object { $_.Name -like "*$version*" -or $_.Name -eq "latest.yml" } |
    ForEach-Object {
        "{0,8:N1} MB  {1}" -f ($_.Length / 1MB), $_.Name
    }

if (-not $Upload) {
    Write-Host ">> done (build only). Pass -Upload -Tag $Tag to publish GitHub release assets."
    exit 0
}

Write-Host ">> resolve GitHub credentials"
$credRaw = ("protocol=https`nhost=github.com`n`n" | git credential fill 2>$null)
$token = ($credRaw | Where-Object { $_ -like "password=*" }) -replace "^password=", ""
if (-not $token) { throw "No GitHub token from git credential helper. Run gh auth login or configure git credentials." }

$headers = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "netcatty-release-win-x64"
}

$owner = "maplejL"
$repo = "Netcatty"
$releaseApi = "https://api.github.com/repos/$owner/$repo/releases/tags/$Tag"

try {
    $release = Invoke-RestMethod -Method Get -Uri $releaseApi -Headers $headers
    Write-Host ">> using existing release $($release.html_url)"
} catch {
    Write-Host ">> creating release $Tag"
    $notesPath = Join-Path $repoRoot "RELEASE_NOTES_$Tag.draft.md"
    $body = if (Test-Path $notesPath) {
        [System.IO.File]::ReadAllText($notesPath)
    } else {
        "Netcatty $Tag (Windows x64 NSIS)."
    }
    $payload = [ordered]@{
        tag_name = $Tag
        target_commitish = (git rev-parse --abbrev-ref HEAD).Trim()
        name = $Tag
        body = $body
        draft = $false
        prerelease = $false
    } | ConvertTo-Json -Compress
    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $release = Invoke-RestMethod -Method Post `
        -Uri "https://api.github.com/repos/$owner/$repo/releases" `
        -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body $payloadBytes
    Write-Host ">> created $($release.html_url)"
}

$uploadUrlBase = $release.upload_url.Split("{")[0]
$existingNames = @($release.assets | ForEach-Object { $_.name })

$assets = @(
    @{ Path = $installer; Name = [IO.Path]::GetFileName($installer); Type = "application/octet-stream" },
    @{ Path = $blockmap; Name = [IO.Path]::GetFileName($blockmap); Type = "application/octet-stream" },
    @{ Path = $latestYml; Name = "latest.yml"; Type = "text/yaml" }
)

if ($Full) {
    $portable = Join-Path $repoRoot "release\Netcatty-$version-portable-win-x64.exe"
    $zip = Join-Path $repoRoot "release\Netcatty-$version-win-x64.zip"
    if (Test-Path $portable) {
        $assets += @{ Path = $portable; Name = [IO.Path]::GetFileName($portable); Type = "application/octet-stream" }
    }
    if (Test-Path $zip) {
        $assets += @{ Path = $zip; Name = [IO.Path]::GetFileName($zip); Type = "application/zip" }
    }
}

foreach ($asset in $assets) {
    if ($existingNames -contains $asset.Name) {
        Write-Host ">> skip existing asset $($asset.Name)"
        continue
    }
    $sizeMb = [math]::Round((Get-Item $asset.Path).Length / 1MB, 1)
    Write-Host ">> upload $($asset.Name) ($sizeMb MB)"
    $fileBytes = [IO.File]::ReadAllBytes($asset.Path)
    $uri = "$uploadUrlBase`?name=$([uri]::EscapeDataString($asset.Name))"
    $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType $asset.Type -Body $fileBytes
    Write-Host "   ok id=$($resp.id)"
}

Write-Host ">> done $($release.html_url)"
