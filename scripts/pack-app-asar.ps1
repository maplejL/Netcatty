# Incremental Windows deploy: rebuild renderer (vite) and repack resources/app.asar only.
# Does not run electron-builder or replace Netcatty.exe / app.asar.unpacked natives.
#
# Usage:
#   .\scripts\pack-app-asar.ps1
#   .\scripts\pack-app-asar.ps1 -InstallPath "D:\work\Netcatty"
#   .\scripts\pack-app-asar.ps1 -SkipBuild
#   .\scripts\pack-app-asar.ps1 -SourceAsar "D:\work\Netcatty\resources\app.asar"

param(
    [string]$InstallPath = "D:\work\Netcatty",
    [string]$SourceAsar = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$targetAsar = Join-Path $InstallPath "resources\app.asar"
if (-not $SourceAsar) {
    if (-not (Test-Path $targetAsar)) {
        throw "Target app.asar not found: $targetAsar. Pass -SourceAsar or -InstallPath."
    }
    $SourceAsar = $targetAsar
}

# Always re-apply the WebGL atlas isolation patch before packaging. Incremental
# deploys often skip postinstall; without this patch multi-pane terminals share
# one texture atlas and sporadically show garbled glyphs (#1063).
Write-Host ">> patch xterm webgl atlas isolation"
node scripts/patch-xterm-webgl-atlas.cjs
if ($LASTEXITCODE -ne 0) { throw "patch-xterm-webgl-atlas failed" }

if (-not $SkipBuild) {
    Write-Host ">> vite build"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
}

$stagingRoot = Join-Path $env:TEMP "netcatty-asar-staging-$([Guid]::NewGuid().ToString('N'))"
$appDir = Join-Path $stagingRoot "app"
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host ">> extract $SourceAsar"
npx --yes @electron/asar extract $SourceAsar $appDir
if ($LASTEXITCODE -ne 0) { throw "asar extract failed" }

function Sync-Tree {
    param([string]$RelativePath)
    $src = Join-Path $repoRoot $RelativePath
    $dst = Join-Path $appDir $RelativePath
    if (-not (Test-Path $src)) { return }
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    $parent = Split-Path $dst -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -Path $src -Destination $dst -Recurse -Force
}

Write-Host ">> sync app payload (dist, electron, ...)"
@(
    "dist",
    "electron",
    "infrastructure\config\terminalFlowConstants.cjs",
    "infrastructure\config\terminalFlowConstants.json",
    "lib",
    "skills",
    "package.json"
) | ForEach-Object {
    $item = Join-Path $repoRoot $_
    if (-not (Test-Path $item)) {
        Write-Warning "skip missing: $_"
        return
    }
    if ((Get-Item $item).PSIsContainer) {
        Sync-Tree $_
    } else {
        $dst = Join-Path $appDir $_
        $parent = Split-Path $dst -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -Path $item -Destination $dst -Force
    }
}

$outAsar = Join-Path $stagingRoot "app.asar"
Write-Host ">> pack $outAsar"
npx --yes @electron/asar pack $appDir $outAsar
if ($LASTEXITCODE -ne 0) { throw "asar pack failed" }

if (-not (Test-Path (Split-Path $targetAsar -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $targetAsar -Parent) -Force | Out-Null
}

$backup = "$targetAsar.bak"
if (Test-Path $targetAsar) {
    Copy-Item $targetAsar $backup -Force
    Write-Host ">> backup $backup"
}

Copy-Item $outAsar $targetAsar -Force
$sizeMb = [math]::Round((Get-Item $targetAsar).Length / 1MB, 2)
Write-Host ">> deployed $targetAsar ($sizeMb MB)"

Remove-Item -Recurse -Force $stagingRoot
Write-Host ">> done (restart Netcatty to load changes)"
