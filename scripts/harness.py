#!/usr/bin/env python3
"""SOVIR scaffold harness: honest gates with no paid API calls or private data."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES_FILE = ROOT / 'tests' / 'fixtures' / 'synthetic_cases.json'
SCHEMA_FILE = ROOT / 'packages' / 'contracts' / 'schemas' / 'observed-event.schema.json'


def run(args):
    process = subprocess.run(args, cwd=ROOT, check=False)
    return process.returncode


def doctor():
    tools = ('python3', 'git', 'cargo', 'rustc', 'node', 'pnpm', 'java', 'xcodebuild', 'flutter', 'docker')
    for tool in tools:
        print(f'{tool:12s}', shutil.which(tool) or 'NOT_INSTALLED')
    print('NOTE: this reports tool presence, not production readiness')
    print('REMINDER: java, xcodebuild, flutter and docker stay deferred; see docs/operations/DEFERRED_TOOLCHAINS.md')
    return 0


def check():
    if run([sys.executable, 'scripts/check_architecture.py']) != 0:
        return 1
    schema = json.loads(SCHEMA_FILE.read_text(encoding='utf-8'))
    required = set(schema.get('required', []))
    expected = {'event_id', 'source_id', 'consent_grant_id', 'content_digest', 'observed_at_ms'}
    if not expected.issubset(required):
        print('FAIL: ObservedEvent must require consent and provenance metadata')
        return 1
    for path in sorted((ROOT / '.cursor' / 'rules').glob('*.mdc')):
        value = path.read_text(encoding='utf-8')
        if not value.startswith('---\n'):
            print(f'FAIL: Cursor rule missing frontmatter: {path}')
            return 1
    print('PASS: JSON Schema and Cursor rule envelope validated at scaffold level')
    print('Backend Rust sources present; compile/test with `make backend-check` (separate gate).')
    print('NOT_IMPLEMENTED: TypeScript, Android, iOS, Tauri, ML end-to-end suites')
    return 0


def evaluate():
    cases = json.loads(CASES_FILE.read_text(encoding='utf-8'))
    if not isinstance(cases, list) or len(cases) < 10:
        print('FAIL: need at least 10 synthetic scenario definitions')
        return 1
    seen = set()
    allowed = {'benign', 'suspicious', 'ambiguous', 'privacy', 'governance', 'cost', 'platform'}
    for case in cases:
        required = {'id', 'scenario', 'class', 'expected_behavior', 'data_policy'}
        if not required.issubset(case):
            print('FAIL: scenario missing fields:', case)
            return 1
        if case['id'] in seen or case['class'] not in allowed or case['data_policy'] != 'synthetic-only':
            print('FAIL: invalid/duplicate/untrusted fixture:', case['id'])
            return 1
        seen.add(case['id'])
    print(f'PASS: {len(cases)} synthetic scenario definitions validated')
    # Real model evals now exist as Rust tests. When cargo is present we
    # run them and surface their metrics; when it is not we stay honest
    # instead of pretending the corpus alone is an eval.
    if not shutil.which('cargo'):
        print('NOT_IMPLEMENTED: cargo unavailable — Rust model evals not run')
        return 0
    evals = (
        ('sovir-domain', 'eval_corpus_reports_agreement_metrics', 'policy-pack agreement'),
        ('sovir-adapters', 'heuristic_eval_corpus_reports_metrics', 'local heuristic inference'),
    )
    failed = False
    for crate, test, label in evals:
        print(f'--- {label} (cargo test -p {crate} {test}) ---')
        out = subprocess.run(
            ['cargo', 'test', '-p', crate, test, '--', '--nocapture'],
            cwd=ROOT, check=False, capture_output=True, text=True,
        )
        for line in (out.stdout + out.stderr).splitlines():
            if 'eval' in line or 'agreement' in line or 'recall' in line or 'latency' in line:
                print('   ', line.strip())
        if out.returncode != 0:
            print(f'FAIL: {label} eval failed')
            failed = True
    return 1 if failed else 0


def benchmark():
    print('NOT_IMPLEMENTED: no paid API or hardware benchmark is configured.')
    print('Set up explicit benchmark manifests and hard budgets before enabling jobs.')
    return 0


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {'doctor', 'check', 'eval', 'benchmark'}:
        print('Usage: python3 scripts/harness.py doctor|check|eval|benchmark')
        return 2
    return {'doctor': doctor, 'check': check, 'eval': evaluate, 'benchmark': benchmark}[sys.argv[1]]()


if __name__ == '__main__':
    raise SystemExit(main())
