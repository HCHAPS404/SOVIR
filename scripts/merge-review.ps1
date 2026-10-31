# merge-review.ps1 — Lists branches with work not yet in main and merges ONLY
# the ones you approve. Nothing merges or pushes without typed confirmation.
# Usage: powershell -File scripts/merge-review.ps1
$ErrorActionPreference = "Stop"
$MAIN = if ($env:SOVIR_MAIN_BRANCH) { $env:SOVIR_MAIN_BRANCH } else { "main" }
Set-Location (git rev-parse --show-toplevel)

function Die($msg) { Write-Host "ABORT: $msg" -ForegroundColor Red; exit 1 }

# ---- 1. Preflight ----------------------------------------------------------
if (git status --porcelain -uno) { Die "staged or modified files present - commit or stash first" }
git fetch origin --prune --quiet; if (-not $?) { Die "git fetch failed" }
git rev-parse --verify "origin/$MAIN" 2>$null | Out-Null
if (-not $?) { Die "origin/$MAIN does not exist" }
git rev-parse --verify $MAIN 2>$null | Out-Null
if ($?) {
  git merge-base --is-ancestor $MAIN "origin/$MAIN"
  if (-not $?) { Die "local $MAIN has unpushed commits - push or stash them first" }
}

# ---- 2. Enumerate unmerged remote branches ---------------------------------
Write-Host "== Branches with commits not in origin/$MAIN =="
$branches = git branch -r --format="%(refname:short)" |
  Where-Object { $_ -notmatch "origin/HEAD" -and $_ -ne "origin/$MAIN" -and $_ -notmatch "^origin/backup" }
$candidates = @()
foreach ($ref in $branches) {
  $ref = $ref.Trim()
  git merge-base --is-ancestor $ref "origin/$MAIN" 2>$null
  if ($LASTEXITCODE -ne 0) { $candidates += $ref }
}
if ($candidates.Count -eq 0) { Write-Host "  (none - everything is already merged)"; exit 0 }

$i = 0
foreach ($ref in $candidates) {
  $i++
  $name = $ref -replace "^origin/", ""
  $ahead = git rev-list --count "origin/$MAIN..$ref"
  Write-Host "`n[$i] $name  - $ahead commit(s) ahead"
  git log --oneline "origin/$MAIN..$ref" | ForEach-Object { "      $_" }
  $stat = git diff --stat "origin/$MAIN...$ref" | Select-Object -Last 1
  Write-Host "      files: $($stat.Trim())"
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $pr = gh pr list --head $name --state open --json number,title,mergeable --limit 1 2>$null
    if ($pr -and $pr -ne "[]") { Write-Host "      PR: $pr" }
  }
}

# ---- 3. Explicit selection ---------------------------------------------------
$sel = Read-Host "`nEnter numbers to merge (e.g. '1 3'), 'all', or Enter to abort"
if (-not $sel) { Die "aborted - nothing merged" }
if ($sel -eq "all") { $chosen = $candidates }
else {
  $chosen = @()
  foreach ($n in ($sel -split "\s+")) {
    if ($n -notmatch '^\d+$' -or [int]$n -lt 1 -or [int]$n -gt $candidates.Count) { Die "invalid selection: $n" }
    $chosen += $candidates[[int]$n - 1]
  }
}

# ---- 4. Merge approved branches into local main ------------------------------
git checkout -q $MAIN
git reset -q --hard "origin/$MAIN"
foreach ($ref in $chosen) {
  $name = $ref -replace "^origin/", ""
  Write-Host "== Merging $name =="
  git merge --no-ff --no-edit $ref
  if (-not $?) { Die "merge conflict in $name - resolve manually, then re-run" }
}

Write-Host "`n== Result on local $MAIN =="
git log --oneline "origin/$MAIN..$MAIN" | ForEach-Object { "   $_" }

# ---- 5. Final gate: push ------------------------------------------------------
$ok = Read-Host "`nPush '$MAIN' to origin? Type YES to confirm"
if ($ok -ne "YES") { Die "aborted before push - local merges kept, nothing published" }
git push origin $MAIN
Write-Host "Done. origin/$MAIN updated."
