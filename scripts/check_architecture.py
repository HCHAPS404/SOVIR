#!/usr/bin/env python3
"""Lightweight scaffold guard. Not a complete production architecture scanner."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'README.md', 'AGENTS.md', 'CLAUDE.md',
    'docs/adr/ADR-0000-template.md',
    'packages/contracts/schemas/observed-event.schema.json',
    '.cursor/rules/00-global.mdc',
    '.claude/agents/architect.md',
    '.devin/README.md',
    '.github/workflows/ci.yml',
]
issues = [f'Missing required file: {p}' for p in REQUIRED if not (ROOT / p).is_file()]

# A conservative preliminary scan. Production-ready boundary checking requires
# a crate graph and a real Rust AST after Cargo projects are created.
DOMAIN = ROOT / 'crates' / 'sovir-domain'
rust_files = list(DOMAIN.rglob('*.rs')) if DOMAIN.exists() else []
for path in rust_files:
    content = path.read_text(encoding='utf-8')
    for disallowed in ('use reqwest::', 'use sqlx::', 'use axum::', 'use tauri::', 'use aws_sdk_'):
        if disallowed in content:
            issues.append(f'Possible hexagonal dependency violation {path.relative_to(ROOT)}: {disallowed}')

if issues:
    for message in issues:
        print('FAIL:', message)
    sys.exit(1)
print('PASS: scaffold governance files and basic architectural static checks')
if not rust_files:
    print('NOT_IMPLEMENTED: Rust domain crate and dependency graph not yet available')
else:
    print(f'CHECKED: {len(rust_files)} Rust source files (lexical scan, not full AST)')
