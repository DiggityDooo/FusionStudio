$ErrorActionPreference = 'Stop'
$research = Join-Path $PSScriptRoot '..\research'
$before = Get-Content -LiteralPath (Join-Path $research 'installations-before.json') -Raw | ConvertFrom-Json
function Resolve-EvidencePath([string]$Path) {
    if (Test-Path -LiteralPath $Path) { return $Path }
    # Three legacy manifest entries were written after a UTF-8 name had been
    # decoded as Windows-1252. Repair only when the candidate exists, keeping
    # the recorded baseline immutable and avoiding broad filename rewriting.
    try {
        $bytes = [Text.Encoding]::GetEncoding(1252).GetBytes($Path)
        $candidate = [Text.Encoding]::UTF8.GetString($bytes)
        if (-not $candidate.Contains([char]0xfffd) -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    } catch {}
    return $Path
}
$lookup = @{}
foreach ($record in $before) { $lookup[(Resolve-EvidencePath $record.path)] = $record }
$roots = @(
    'C:\Program Files\Blender Foundation\Blender 5.2',
    'C:\Program Files\DAZ 3D\DAZStudio4',
    'C:\Program Files\Marvelous Designer Enterprise Network Offline',
    'C:\Program Files\Reallusion\Character Creator 5'
)
$changed = @()
$added = @()
$seen = @{}
foreach ($root in $roots) {
    foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse) {
        $seen[$file.FullName] = $true
        if (-not $lookup.ContainsKey($file.FullName)) { $added += $file.FullName; continue }
        $record = $lookup[$file.FullName]
        if ($record.length -ne $file.Length -or $record.modified -ne $file.LastWriteTimeUtc.Ticks) { $changed += $file.FullName }
    }
}
$missing = @($lookup.Keys | Where-Object { -not $seen.ContainsKey($_) })
$bounded = Get-Content -LiteralPath (Join-Path $research 'original-files-manifest.json') -Raw | ConvertFrom-Json
$hashes = @()
foreach ($record in $bounded.files) {
    $hash = (Get-FileHash -LiteralPath $record.path -Algorithm SHA256).Hash.ToLower()
    $hashes += [pscustomobject]@{path=$record.path;matches=($record.sha256 -eq $hash);sha256=$hash}
}
$blenderEvidence = Get-Content -LiteralPath (Join-Path $research 'blender-pe-evidence.json') -Raw | ConvertFrom-Json
$blenderHash = (Get-FileHash -LiteralPath $blenderEvidence.subject.local_path -Algorithm SHA256).Hash.ToLower()
$hashes += [pscustomobject]@{path=$blenderEvidence.subject.local_path;matches=($blenderHash -eq $blenderEvidence.subject.digest.sha256);sha256=$blenderHash}
$report = [ordered]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    recordedFiles = $before.Count
    currentFiles = $seen.Count
    metadataChanged = $changed
    added = $added
    missing = $missing
    boundedSha256Checks = $hashes
    passed = ($changed.Count -eq 0 -and $added.Count -eq 0 -and $missing.Count -eq 0 -and @($hashes | Where-Object { -not $_.matches }).Count -eq 0)
    limitation = 'Whole-installation comparison covers size, path, and modification time. SHA-256 coverage is limited to the listed evidence files and Blender executable.'
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $research 'preservation-verification.json') -Encoding utf8
[pscustomobject]$report | Select-Object recordedFiles,currentFiles,passed | Format-List
Write-Output ('Changed: ' + $changed.Count + '; added: ' + $added.Count + '; missing: ' + $missing.Count + '; SHA-256 checks: ' + $hashes.Count)
if (-not $report.passed) { exit 1 }
