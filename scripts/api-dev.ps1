# Starts sovir-api with env loaded from .env.local (gitignored real secrets).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/api-dev.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env.local'
if (-not (Test-Path $envFile)) {
    Write-Error ".env.local not found — copy .env.example to .env.local and fill real values."
}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
        $kv = $line -split '=', 2
        if ($kv.Count -eq 2 -and $kv[1].Trim() -ne '' -and $kv[1] -notmatch '<.*>') {
            [Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), 'Process')
        }
    }
}
Set-Location $repo
cargo run -p sovir-api
