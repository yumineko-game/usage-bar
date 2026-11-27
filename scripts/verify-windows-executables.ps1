param(
    [Parameter(Mandatory = $true)]
    [string]$DesktopExe,

    [Parameter(Mandatory = $true)]
    [string]$LegacyDesktopExe
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'release-pipeline-common.ps1')

function Resolve-RequiredPath {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing $Label at $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Get-PeSubsystem {
    param([string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $reader = [System.IO.BinaryReader]::new($stream)
        try {
            [void]$stream.Seek(0x3c, [System.IO.SeekOrigin]::Begin)
            $peOffset = $reader.ReadInt32()
            [void]$stream.Seek($peOffset + 4 + 20 + 68, [System.IO.SeekOrigin]::Begin)
            return $reader.ReadUInt16()
        } finally {
            $reader.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

$desktop = Resolve-RequiredPath -Path $DesktopExe -Label "desktop executable"
$legacyDesktop = Resolve-RequiredPath -Path $LegacyDesktopExe -Label "desktop compatibility executable"

$desktopHash = Get-Sha256 $desktop
$legacyDesktopHash = Get-Sha256 $legacyDesktop

if ($desktopHash -ne $legacyDesktopHash) {
    throw "codexbar.exe and codexbar-desktop.exe should be identical desktop binaries."
}

$desktopSubsystem = Get-PeSubsystem $desktop
$legacyDesktopSubsystem = Get-PeSubsystem $legacyDesktop

if ($desktopSubsystem -ne 2) {
    throw "codexbar.exe must be a Windows GUI-subsystem desktop binary; got subsystem $desktopSubsystem."
}
if ($legacyDesktopSubsystem -ne 2) {
    throw "codexbar-desktop.exe must be a Windows GUI-subsystem desktop binary; got subsystem $legacyDesktopSubsystem."
}
$dynamicCrt = @(Get-DynamicCrtImports (Get-PeImportedDllNames $desktop))
if ($dynamicCrt.Count -gt 0) {
    throw "codexbar.exe links the C runtime dynamically ($($dynamicCrt -join ', ')); release builds must use +crt-static."
}

Write-Host "Windows desktop executable and compatibility alias verified."
