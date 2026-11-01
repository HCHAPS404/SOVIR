# install-hooks.ps1 — installs repo git hooks into .git/hooks/.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install-hooks.ps1
$ErrorActionPreference = "Stop"
Set-Location (git rev-parse --show-toplevel)

$src = "scripts/git-hooks/commit-msg"
$dst = ".git/hooks/commit-msg"
if (-not (Test-Path $src)) { Write-Error "missing $src"; exit 1 }

Copy-Item $src $dst -Force
Write-Host "installed: $dst"
