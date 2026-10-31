#!/usr/bin/env bash
# merge-review.sh — Enumerates branches with work not yet in main and merges
# ONLY the ones you explicitly approve. Nothing is merged or pushed without
# typed confirmation. Usage: bash scripts/merge-review.sh
set -euo pipefail

MAIN="${SOVIR_MAIN_BRANCH:-main}"
cd "$(git rev-parse --show-toplevel)"

die() { echo "ABORT: $*" >&2; exit 1; }

# ---- 1. Preflight ----------------------------------------------------------
[ -z "$(git status --porcelain -uno)" ] || die "staged or modified files present — commit or stash first"
git fetch origin --prune --quiet || die "git fetch failed"
git rev-parse --verify "origin/$MAIN" >/dev/null || die "origin/$MAIN does not exist"

# Refuse to lose local-only commits on $MAIN (we reset to origin/$MAIN below).
git rev-parse --verify "$MAIN" >/dev/null 2>&1 && \
  { git merge-base --is-ancestor "$MAIN" "origin/$MAIN" \
    || die "local $MAIN has unpushed commits — push or stash them first"; }

# ---- 2. Enumerate unmerged remote branches ---------------------------------
echo "== Branches with commits not in origin/$MAIN =="
candidates=()
for ref in $(git branch -r --format="%(refname:short)" | grep -v "origin/HEAD" | grep -v "origin/$MAIN$" | grep -v "^origin/backup"); do
  if ! git merge-base --is-ancestor "$ref" "origin/$MAIN" 2>/dev/null; then
    candidates+=("$ref")
  fi
done
[ ${#candidates[@]} -gt 0 ] || { echo "  (none — everything is already merged)"; exit 0; }

i=0
for ref in "${candidates[@]}"; do
  i=$((i+1))
  name="${ref#origin/}"
  ahead=$(git rev-list --count "origin/$MAIN..$ref")
  echo
  echo "[$i] $name  — $ahead commit(s) ahead"
  git log --oneline "origin/$MAIN..$ref" | sed 's/^/      /'
  echo "      files: $(git diff --stat "origin/$MAIN...$ref" | tail -1 | sed 's/^ *//')"
  if command -v gh >/dev/null 2>&1; then
    pr=$(gh pr list --head "$name" --state open --json number,title,mergeable --limit 1 2>/dev/null || true)
    [ -n "$pr" ] && [ "$pr" != "[]" ] && echo "      PR: $pr"
  fi
done

# ---- 3. Explicit selection -------------------------------------------------
echo
read -rp "Enter numbers to merge (e.g. '1 3'), 'all', or Enter to abort: " sel
[ -n "$sel" ] || die "aborted — nothing merged"
if [ "$sel" = "all" ]; then
  chosen=("${candidates[@]}")
else
  chosen=()
  for n in $sel; do
    [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le ${#candidates[@]} ] \
      || die "invalid selection: $n"
    chosen+=("${candidates[$((n-1))]}")
  done
fi

# ---- 4. Merge approved branches into local main ----------------------------
git checkout -q "$MAIN"
git reset -q --hard "origin/$MAIN"
for ref in "${chosen[@]}"; do
  name="${ref#origin/}"
  echo "== Merging $name =="
  git merge --no-ff --no-edit "$ref" || die "merge conflict in $name — resolve manually, then re-run"
done

echo
echo "== Result on local $MAIN =="
git log --oneline "origin/$MAIN..$MAIN" | sed 's/^/   /'

# ---- 5. Final gate: push ----------------------------------------------------
echo
read -rp "Push '$MAIN' to origin? Type YES to confirm: " ok
[ "$ok" = "YES" ] || die "aborted before push — local merges kept, nothing published"
git push origin "$MAIN"
echo "Done. origin/$MAIN updated."
