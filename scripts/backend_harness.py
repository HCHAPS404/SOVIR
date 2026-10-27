#!/usr/bin/env python3
"""Honest backend gate: static checks always, compile/unit test when cargo available."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
EXPECTED = [
 'Cargo.toml','crates/sovir-domain/src/lib.rs', 'crates/sovir-ports/src/lib.rs',
 'crates/sovir-application/src/lib.rs','crates/sovir-adapters/src/lib.rs',
 'crates/sovir-inference/src/lib.rs','services/api/src/main.rs',
 'packages/contracts/openapi/backend-dev.v0.yaml',
 'infra/postgres/migrations/0001_initial.sql',
 'docs/backend/BACKEND_MASTER_PLAN.md'
]
def main():
    failures=[]
    for file in EXPECTED:
        if not (ROOT / file).is_file():failures.append(f'missing: {file}')
    schema=json.loads((ROOT/'packages/contracts/schemas/observed-event.schema.json').read_text())
    if 'consent_grant_id' not in schema['required']:failures.append('consent must be mandatory')
    if 'signals' not in schema['properties']:failures.append('risk signals contract missing')
    for file in ['crates/sovir-domain/src/lib.rs','crates/sovir-application/src/lib.rs']:
        contents=(ROOT/file).read_text()
        for disallowed in ['use axum::','use sqlx::','use reqwest::','use tokio::']:
            if disallowed in contents:failures.append(f'{file}: forbidden direct infrastructure dependency {disallowed}')
    if failures:
        for failure in failures:print('FAIL:',failure)
        return 1
    print('PASS: backend structure, consent contract, domain/application lexical boundaries')
    cargo=shutil.which('cargo')
    if not cargo:
        print('NOT_RUN: cargo not installed in this environment; Rust compilation/tests NOT verified')
        return 0 if os.environ.get('SOVIR_BACKEND_REQUIRE_RUST') != '1' else 2
    for command in [['cargo','fmt','--all','--','--check'],['cargo','test','--workspace'],['cargo','clippy','--workspace','--all-targets','--','-D','warnings']]:
        print('RUN:', ' '.join(command),flush=True)
        p=subprocess.run(command,cwd=ROOT)
        if p.returncode:return p.returncode
    print('PASS: Rust format, tests and lint')
    return 0
if __name__=='__main__':sys.exit(main())
