#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$PublishUnsigned,
    [string]$NotesFile,
    [string]$InnoSetup,
    [string]$WebView2Bootstrapper
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$repository = 'yumineko-game/usage-bar'
. (Join-Path $PSScriptRoot 'release-pipeline-common.ps1')

function Invoke-ReleaseCommand {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE." }
}

function Get-ReleaseCommit {
    $commit = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $commit -cnotmatch '^[0-9a-f]{40}$') { throw 'Could not resolve HEAD.' }
    $changes = git status --porcelain
    if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Commit the complete release source before running this script.' }
    return $commit
}

function Get-ReleaseRecord {
    $records = gh api "repos/$repository/releases?per_page=100" --paginate --jq '.[] | @json'
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the GitHub release.' }
    foreach ($record in $records) {
        $release = $record | ConvertFrom-Json
        if ($release.tag_name -ceq $tag) { return $release }
    }
}

function Wait-ReleaseRecord {
    param([bool]$Draft, [int]$AssetCount = 0)
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $release = Get-ReleaseRecord
        if ($release -and $release.draft -eq $Draft -and -not $release.prerelease) {
            $uploaded = @($release.assets | Where-Object { $_.state -eq 'uploaded' -and $_.digest })
            if ($AssetCount -eq 0 -or $uploaded.Count -eq $AssetCount) { return $release }
        }
        if ($attempt -lt 8) { Start-Sleep -Seconds 2 }
    }
    throw "GitHub did not return the expected release state for $tag."
}

function Invoke-SafeWrite {
    param([string]$Kind, [string[]]$Arguments)
    $scope = @('scripts/gh-safe.sh', '--repo', $repository, '--verify-kind', $Kind)
    if ($Kind -eq 'release') { $scope += @('--target', $tag) }
    Invoke-ReleaseCommand $bash ($scope + '--' + $Arguments)
}

function Assert-RemoteAssets {
    param($Release, [string[]]$Files)
    if (@($Release.assets).Count -ne $Files.Count) { throw 'The GitHub asset set differs from the local release.' }
    foreach ($file in $Files) {
        $name = Split-Path -Leaf $file
        $asset = @($Release.assets | Where-Object { $_.name -ceq $name })
        $expected = 'sha256:' + (Get-AssetSha256 $file)
        if ($asset.Count -ne 1 -or $asset[0].state -ne 'uploaded' -or $asset[0].digest -ne $expected) {
            throw "GitHub SHA-256 check failed for $name."
        }
    }
}

function Publish-Release {
    param([string[]]$Files)
    $release = Get-ReleaseRecord
    if ($release -and -not $release.draft) {
        $actual = gh api "repos/$repository/git/ref/tags/$tag" --jq .object.sha
        if ($LASTEXITCODE -ne 0 -or $actual -cne $commit) { throw 'The existing release tag points to a different commit.' }
        Assert-RemoteAssets $release $Files
        Write-Host $release.html_url
        return
    }
    Invoke-SafeWrite 'repo' @('git-release-tag', $tag, $commit)
    if (-not $release) {
        Invoke-SafeWrite 'repo' @('release', 'create', $tag, '--verify-tag', '--draft', '--title', "UsageBar $version", '--notes-file', $NotesFile)
        $release = Wait-ReleaseRecord -Draft $true
    }
    $missing = @()
    foreach ($file in $Files) {
        $name = Split-Path -Leaf $file
        $existing = @($release.assets | Where-Object { $_.name -ceq $name })
        if ($existing.Count -eq 0) {
            $missing += $file
        } elseif ($existing.Count -ne 1 -or $existing[0].digest -ne ('sha256:' + (Get-AssetSha256 $file))) {
            throw "The draft already contains a different file named $name."
        }
    }
    if ($missing.Count) { Invoke-SafeWrite 'release' (@('release', 'upload', $tag) + $missing) }
    $release = Wait-ReleaseRecord -Draft $true -AssetCount $Files.Count
    Assert-RemoteAssets $release $Files
    Invoke-SafeWrite 'release' @('release', 'edit', $tag, '--draft=false', '--latest')
    $release = Wait-ReleaseRecord -Draft $false -AssetCount $Files.Count
    Assert-RemoteAssets $release $Files
    Write-Host $release.html_url
}

if ($PublishUnsigned) {
    if (-not $NotesFile) { throw 'Pass -NotesFile when publishing a release.' }
    $NotesFile = (Resolve-Path -LiteralPath $NotesFile).Path
    $git = Get-Command git.exe
    $bash = Join-Path (Split-Path -Parent (Split-Path -Parent $git.Source)) 'bin\bash.exe'
    if (-not (Test-Path -LiteralPath $bash -PathType Leaf)) { throw 'Git Bash is required to run gh-safe.sh.' }
}
if ($WebView2Bootstrapper) { $WebView2Bootstrapper = (Resolve-Path -LiteralPath $WebView2Bootstrapper).Path }
if ($InnoSetup) { $InnoSetup = (Resolve-Path -LiteralPath $InnoSetup).Path }

Push-Location $repoRoot
try {
    $commit = Get-ReleaseCommit
    $versionFile = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'version.env')
    if ($versionFile -notmatch '(?m)^MARKETING_VERSION=((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))\r?$') {
        throw 'version.env must contain a stable MARKETING_VERSION.'
    }
    $version = $Matches[1]
    $tag = "v$version"
    if ($versionFile -notmatch '(?m)^BUILD_NUMBER=([0-9]+)\r?$') { throw 'version.env must contain BUILD_NUMBER.' }
    $env:BUILD_NUMBER = $Matches[1]
    $versionPattern = '(?m)^version = "' + [regex]::Escape($version) + '"\r?$'
    foreach ($manifest in @('rust/Cargo.toml','apps/desktop-tauri/src-tauri/Cargo.toml')) {
        if ((Get-Content -Raw -LiteralPath $manifest) -notmatch $versionPattern) { throw "Version mismatch in $manifest." }
    }
    foreach ($manifest in @('apps/desktop-tauri/package.json','apps/desktop-tauri/src-tauri/tauri.conf.json')) {
        if ((Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json).version -cne $version) { throw "Version mismatch in $manifest." }
    }

    & (Join-Path $PSScriptRoot 'worktree-env.ps1') -RepoRoot $repoRoot | Out-Host
    $outputDir = Join-Path $env:CARGO_TARGET_DIR "usagebar-releases\$tag-$commit"
    $outputDir = [IO.Path]::GetFullPath($outputDir)
    $installerName = "UsageBar-$version-Setup"
    $installer = Join-Path $outputDir "$installerName.exe"
    $portable = Join-Path $outputDir "UsageBar-$version-portable.exe"
    $files = @($installer, $portable)
    $complete = Join-Path $outputDir 'verified-assets'
    if (-not (Test-Path -LiteralPath $complete)) {
        $payload = Join-Path $outputDir 'payload'
        New-Item -ItemType Directory -Force -Path $outputDir,$payload | Out-Null
        if (-not $InnoSetup) {
            $candidates = @(
                (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
                (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe')
                (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
            )
            $InnoSetup = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
            if (-not $InnoSetup) { throw 'Inno Setup is required. Pass its installed ISCC.exe through -InnoSetup.' }
        }
        if (-not $WebView2Bootstrapper) {
            $WebView2Bootstrapper = Join-Path $outputDir 'MicrosoftEdgeWebview2Setup.exe'
            if (-not (Test-Path -LiteralPath $WebView2Bootstrapper)) {
                Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $WebView2Bootstrapper
            }
        }
        $signature = Get-AuthenticodeSignature -FilePath $WebView2Bootstrapper
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation(?:,|$)') {
            throw 'The WebView2 bootstrapper must have a valid Microsoft signature.'
        }

        $desktop = & (Join-Path $PSScriptRoot 'dev.ps1') -Release -BuildOnly
        if (-not $desktop) { throw 'The desktop build did not return an executable.' }
        Copy-Item -LiteralPath $desktop -Destination (Join-Path $payload 'codexbar.exe') -Force
        Copy-Item -LiteralPath $desktop -Destination (Join-Path $payload 'codexbar-desktop.exe') -Force
        Invoke-ReleaseCommand $InnoSetup @(
            '/Qp', "/DAppVersion=$version", "/DTargetBinDir=$payload",
            "/DWebView2BootstrapperPath=$WebView2Bootstrapper", "/DOutputDir=$outputDir",
            "/DOutputBaseFilename=$installerName", 'rust\installer\codexbar.iss'
        )
        Copy-Item -LiteralPath $desktop -Destination $portable -Force
        foreach ($file in $files) {
            "$(Get-AssetSha256 $file)  $(Split-Path -Leaf $file)" | Set-Content -LiteralPath "$file.sha256" -Encoding ASCII
        }
        if ((Get-ReleaseCommit) -cne $commit) { throw 'HEAD changed while building the release.' }
        Set-Content -LiteralPath $complete -Value $commit -Encoding ASCII
    }

    if ((Get-ReleaseCommit) -cne $commit) { throw 'The release commit changed.' }
    foreach ($file in $files) { Assert-AssetMatchesSidecar $file }
    Write-Host "Verified local assets: $outputDir"
    if ($PublishUnsigned) { Publish-Release ($files + @($files | ForEach-Object { "$_.sha256" })) }
} finally {
    Pop-Location
}
