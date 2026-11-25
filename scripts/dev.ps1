#Requires -Version 5.1
<#
.SYNOPSIS
    Build and run the UsageBar Tauri desktop shell for Windows.

.DESCRIPTION
    Checks that build prerequisites are installed, then builds the Tauri desktop
    shell through the Tauri CLI and launches it.

.PARAMETER Release
    Build in release mode (optimised). Default is debug.

.PARAMETER SkipBuild
    Skip the build step and run the last built binary.

.PARAMETER BuildOnly
    Build the desktop binary and return its path without launching it.

.PARAMETER Verbose
    Enable debug logging via RUST_LOG for the Tauri desktop shell.

.EXAMPLE
    .\scripts\dev.ps1                  # debug build + run
    .\scripts\dev.ps1 -Release         # release build + run
    .\scripts\dev.ps1 -SkipBuild       # run last build
    .\scripts\dev.ps1 -Verbose         # debug build + run with verbose logging
#>

param(
    [switch]$Release,
    [switch]$SkipBuild,
    [switch]$Verbose,
    [switch]$BuildOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TauriFrontendDir = Join-Path $RepoRoot "apps\desktop-tauri"
$DesktopBinaryName = "codexbar-desktop-tauri.exe"

function Get-RustHostTriple {
    if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
        return $null
    }

    $versionDetails = rustc -vV 2>$null
    $hostLine = $versionDetails | Where-Object { $_ -like 'host:*' } | Select-Object -First 1
    if (-not $hostLine) {
        return $null
    }

    return ($hostLine -replace '^host:\s*', '').Trim()
}

function Get-DesktopBinaryCandidates {
    param(
        [string]$TargetDirectory,
        [string]$Profile,
        [string]$ConfiguredTarget
    )

    if ($ConfiguredTarget) {
        Join-Path $TargetDirectory "$ConfiguredTarget\$Profile\$DesktopBinaryName"
    } else {
        Join-Path $TargetDirectory "$Profile\$DesktopBinaryName"
    }
    if ($SkipBuild) {
        Join-Path $TargetDirectory "$Profile\$DesktopBinaryName"
        Join-Path $TargetDirectory "x86_64-pc-windows-msvc\$Profile\$DesktopBinaryName"
        Join-Path $TargetDirectory "x86_64-pc-windows-gnu\$Profile\$DesktopBinaryName"
    }
}

# ── Ensure known tool paths are in current session PATH ─────────────────────

$knownPaths = @("$env:USERPROFILE\.cargo\bin", "C:\mingw64\bin")
if ($env:CARGO_HOME) { $knownPaths += Join-Path $env:CARGO_HOME 'bin' }
foreach ($p in $knownPaths) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
    }
}

# ── Check prerequisites ─────────────────────────────────────────────────────

$hasCargo = [bool](Get-Command cargo -ErrorAction SilentlyContinue)
$rustHostTriple = Get-RustHostTriple
$needsDlltool = $rustHostTriple -like '*-windows-gnu'
$hasDlltool = [bool](Get-Command dlltool -ErrorAction SilentlyContinue)

if (-not $hasCargo -or ($needsDlltool -and -not $hasDlltool)) {
    $missing = @()
    if (-not $hasCargo)   { $missing += "cargo (Rust)" }
    if ($needsDlltool -and -not $hasDlltool) { $missing += "dlltool (MinGW-w64)" }
    Write-Host "Missing prerequisites: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Install the required tools, restart your terminal, then rerun .\scripts\dev.ps1." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Required:" -ForegroundColor Cyan
    Write-Host "  - Rust/Cargo: https://rustup.rs/ or 'mise install rust@stable'" -ForegroundColor Cyan
    Write-Host "  - Node.js + pnpm: https://nodejs.org/ and 'corepack enable pnpm', or mise-managed node/pnpm" -ForegroundColor Cyan
    Write-Host "  - Microsoft Visual Studio Build Tools with the Desktop development with C++ workload" -ForegroundColor Cyan
    if ($needsDlltool) {
        Write-Host ""
        Write-Host "This shell is using a GNU Rust target, which also needs MinGW-w64 dlltool." -ForegroundColor Yellow
        Write-Host "Install MinGW-w64 or switch Rust to the MSVC target: rustup default stable-x86_64-pc-windows-msvc" -ForegroundColor Yellow
    }
    exit 1
}

& (Join-Path $PSScriptRoot 'worktree-env.ps1') -RepoRoot $RepoRoot | Out-Host

# ── Build ────────────────────────────────────────────────────────────────────

if (-not $SkipBuild) {
    $originalPath = $env:PATH
    $shimDir = $null
    Push-Location $TauriFrontendDir
    try {
        $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
        if (-not $pnpmCommand) {
            $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
            if (-not $corepack) { throw 'Install the pinned pnpm or Node.js with Corepack before building.' }
            # Tauri and package.json both call pnpm by name in child processes.
            $shimDir = Join-Path ([IO.Path]::GetTempPath()) ('usagebar-pnpm-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $shimDir | Out-Null
            & $corepack.Source enable --install-directory $shimDir pnpm | Out-Host
            if ($LASTEXITCODE -ne 0) { throw "Corepack exited with code $LASTEXITCODE." }
            $env:PATH = "$shimDir;$env:PATH"
            $pnpmCommand = Get-Command pnpm.cmd
        }

        if ($BuildOnly -or -not (Test-Path -LiteralPath 'node_modules\.bin\tauri.cmd' -PathType Leaf)) {
            & $pnpmCommand.Source install --frozen-lockfile --prefer-offline | Out-Host
            if ($LASTEXITCODE -ne 0) { throw "pnpm install exited with code $LASTEXITCODE." }
        }

        $buildScript = if ($Release) { 'tauri:build' } else { 'tauri:build:debug' }
        Write-Host 'Building UsageBar (no bundle)...' -ForegroundColor Cyan
        & $pnpmCommand.Source run $buildScript | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "UsageBar build exited with code $LASTEXITCODE." }
    } finally {
        Pop-Location
        $env:PATH = $originalPath
        if ($shimDir -and (Test-Path -LiteralPath $shimDir -PathType Container)) {
            Get-ChildItem -LiteralPath $shimDir -File | Remove-Item
            Remove-Item -LiteralPath $shimDir
        }
    }
}

# ── Run ──────────────────────────────────────────────────────────────────────

# Binary may be under target/<profile> or target/<triple>/<profile>
$profile = if ($Release) { "release" } else { "debug" }
$cargoConfigPath = Join-Path $RepoRoot ".cargo\config.toml"
$configuredTarget = $null

if ($env:CARGO_BUILD_TARGET) {
    $configuredTarget = $env:CARGO_BUILD_TARGET
} elseif (Test-Path $cargoConfigPath) {
    $targetLine = Get-Content $cargoConfigPath | Where-Object { $_ -match '^\s*target\s*=\s*"([^"]+)"' } | Select-Object -First 1
    if ($targetLine -and $targetLine -match '^\s*target\s*=\s*"([^"]+)"') {
        $configuredTarget = $Matches[1]
    }
}

$candidates = @(Get-DesktopBinaryCandidates -TargetDirectory $env:CARGO_TARGET_DIR -Profile $profile -ConfiguredTarget $configuredTarget)
if ($SkipBuild) {
    $candidates += Get-DesktopBinaryCandidates -TargetDirectory (Join-Path $RepoRoot 'target') -Profile $profile -ConfiguredTarget $configuredTarget
}

$binary = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $binary) {
    Write-Host "ERROR: Binary not found. Searched:" -ForegroundColor Red
    $candidates | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "Run without -SkipBuild to build first." -ForegroundColor Yellow
    exit 1
}

if ($BuildOnly) { return $binary }

if ($Verbose) {
    if (-not $env:RUST_LOG) {
        $env:RUST_LOG = "debug"
    }
    Write-Host "Verbose logging enabled via RUST_LOG=$env:RUST_LOG" -ForegroundColor Cyan
}
if (-not $env:TAURI_DEV) {
    $env:TAURI_DEV = "0"
}

Write-Host ""
Write-Host "Starting UsageBar..." -ForegroundColor Green
& $binary
