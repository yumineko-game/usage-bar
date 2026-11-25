#Requires -Version 5.1
[CmdletBinding()]
param([string]$CargoTargetDirectory)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-UsageBarInstallDirectory {
    $uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\WinCodexBar_is1'
    $key = @(
        "HKCU:\$uninstallKey"
        "HKLM:\$uninstallKey"
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\WinCodexBar_is1'
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $key) { return }

    $entry = Get-ItemProperty -LiteralPath $key
    if ($entry.DisplayName -notmatch '^UsageBar(?:$| )') {
        throw 'The existing WinCodexBar installer entry belongs to a different app.'
    }
    $directory = $entry.InstallLocation
    if (-not [IO.Path]::IsPathRooted($directory)) {
        throw 'The UsageBar install directory is missing from the Windows uninstall entry.'
    }
    return $directory
}

function Start-UsageBarPreview {
    if ($CargoTargetDirectory) { $env:WCB_CARGO_TARGET_DIR = $CargoTargetDirectory }
    $binary = & (Join-Path $PSScriptRoot 'dev.ps1') -BuildOnly
    if (-not $binary) { throw 'The local build did not produce a desktop executable.' }

    $install = Get-UsageBarInstallDirectory
    $resumePath = $null
    try {
        if ($install) {
            $installedPaths = @(
                (Join-Path $install 'codexbar.exe')
                (Join-Path $install 'codexbar-desktop.exe')
            )
            $runningInstalls = Get-Process -Name codexbar,codexbar-desktop -ErrorAction SilentlyContinue |
                Where-Object { $_.Path -in $installedPaths }
            foreach ($process in $runningInstalls) {
                $path = $process.Path
                Stop-Process -InputObject $process -ErrorAction Stop
                $resumePath = $path
                if (-not $process.WaitForExit(10000)) {
                    throw 'The installed UsageBar process did not exit.'
                }
            }
        }

        Write-Host 'Starting the local build. Quit it from the tray to end the preview.'
        $env:TAURI_DEV = '0'
        $preview = Start-Process -FilePath $binary -ArgumentList 'menubar' -PassThru
        [void]$preview.Handle
        if ($preview.WaitForExit(1500)) {
            throw 'The local build exited during startup. Quit any other UsageBar instance and retry.'
        }
        $preview.WaitForExit()
        if ($preview.ExitCode -ne 0) { throw "The local build exited with code $($preview.ExitCode)." }
    } finally {
        if ($resumePath) { Start-Process -FilePath $resumePath -ArgumentList '--autostart' }
    }
}

$actionMutex = [System.Threading.Mutex]::new($false, 'Local\UsageBar.LocalPreview')
$ownsMutex = $false
try {
    try {
        $ownsMutex = $actionMutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
        $ownsMutex = $true
    }
    if (-not $ownsMutex) { throw 'Another UsageBar local preview is running.' }

    Start-UsageBarPreview
} finally {
    if ($ownsMutex) { $actionMutex.ReleaseMutex() }
    $actionMutex.Dispose()
}
