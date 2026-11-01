#!/usr/bin/env bash
# install-hooks.sh — installs repo git hooks into .git/hooks/.
# Currently: commit-msg (rejects agent attribution in commit messages).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

src="scripts/git-hooks/commit-msg"
dst=".git/hooks/commit-msg"
[ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

cp "$src" "$dst"
chmod +x "$dst"
echo "installed: $dst"
