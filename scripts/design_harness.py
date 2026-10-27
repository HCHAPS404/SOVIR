#!/usr/bin/env python3
"""SOVIR design-scaffold consistency checks (not a visual accessibility test)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_PLATFORMS = {
    'web-public', 'web-auth', 'web-app', 'browser', 'ios', 'android',
    'macos', 'windows', 'linux-gnome', 'linux-kde'
}


def relative_luminance(hx: str) -> float:
    vals = [int(hx[i:i+2],16)/255 for i in (1,3,5)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in vals]
    return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2]


def contrast(a: str, b: str) -> float:
    x,y = sorted([relative_luminance(a), relative_luminance(b)], reverse=True)
    return (x+.05)/(y+.05)


def main() -> int:
    required = [
        'docs/design/FRONTEND_MASTER_PLAN.md',
        'docs/design/BRAND_DECISION_WORKSHOP.md',
        'docs/design/FIGMA_WORKFLOW.md',
        'docs/design/FRONTEND_GOVERNANCE.md',
        'docs/design/REVIEW_SCORECARD.md',
        'docs/adr/ADR-0003-frontend-brand-platform-expressions.md',
        'docs/adr/ADR-0004-web-public-private-separation.md',
        'apps/website/README.md',
        'packages/ui-web/README.md',
        'design/figma/screen-manifest.json',
        'packages/design-system/component-contracts.json',
        '.cursor/rules/50-design-fidelity.mdc',
        '.cursor/rules/51-marketing-and-brand.mdc',
    ]
    missing = [p for p in required if not (ROOT/p).is_file()]
    if missing:
        print('FAIL: missing design specs: ', ', '.join(missing));return 1
    candidates = json.loads((ROOT/'packages/design-system/tokens/brand-candidates.json').read_text())
    if candidates.get('status') != 'EXPLORATION_NOT_APPROVED' or not candidates.get('policy',{}).get('requiresHumanApproval'):
        print('FAIL: branding improperly marked approved');return 1
    manifest = json.loads((ROOT/'design/figma/screen-manifest.json').read_text())
    screens = manifest.get('screens',[])
    ids=[s['id'] for s in screens]
    if len(ids)!=len(set(ids)) or not EXPECTED_PLATFORMS.issubset({s['platform'] for s in screens}):
        print('FAIL: duplicate screens or missing platform:', EXPECTED_PLATFORMS - {s['platform'] for s in screens});return 1
    if manifest['figma']['status']=='not-created':
        if manifest['figma']['brandFileKey'] or manifest['figma']['productFileKey'] or any(s['nodeId'] for s in screens):
            print('FAIL: guessed Figma node/file IDs detected');return 1
    contracts = json.loads((ROOT/'packages/design-system/component-contracts.json').read_text())
    patterns = {p['name'] for p in contracts['patterns']}
    if not {'ConsentScopePicker','RiskEvidenceCard','InvestigationTimeline'}.issubset(patterns):
        print('FAIL: missing critical safety UX patterns');return 1
    print('PASS: frontend design docs, pending approvals and platform screen inventory')
    for name, c in candidates['candidates'].items():
        ratio=contrast(c['bg'],c['fg'])
        print(f'PRELIMINARY palette {name}: contrast bg/fg = {ratio:.2f}:1 (>=4.5 text AA)')
        if ratio<4.5:
            print('FAIL: candidate base text pair lacks AA contrast');return 1
    print('NOT_IMPLEMENTED: Figma file, UI components, brand sign-off, screenshot baselines, Storybook, native/UI E2E')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
