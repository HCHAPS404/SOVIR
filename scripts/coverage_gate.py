#!/usr/bin/env python3
"""Coverage gate: parse `cargo llvm-cov --workspace --summary-only` output
and enforce per-crate line-coverage floors plus a total floor.

Floors are calibrated to the 2026-10-30 CI baseline (total 58.69% lines).
sovir-persistence (0%) and services/migrations (0%) are EXCLUDED — they
require a live Postgres, a deferred toolchain; gating them would force a
trivially-false floor. sovir-observer is floor-25: most of it is
Windows-gated code that cannot execute on the Linux CI runner.

Usage: coverage_gate.py [report-file]   (stdin if no file)
Exit 0 = pass, 1 = a floor is violated or the report is unparseable.
"""
import re
import sys

TOTAL_FLOOR = 55.0
FLOORS = {
    "crates/sovir-domain/": 85.0,
    "crates/sovir-adapters/": 85.0,
    "crates/sovir-application/": 80.0,
    "crates/sovir-edge-extract/": 90.0,
    "crates/sovir-edge-store/": 90.0,
    "crates/sovir-ports/": 40.0,
    "services/api/": 50.0,
    "services/observer/": 25.0,
}
EXCLUDED_PREFIXES = ("crates/sovir-persistence/", "services/migrations/")

# Columns: Filename Regions MissedRegions Cover Functions MissedFunctions
#          Executed Lines MissedLines Cover Branches MissedBranches Cover
LINE_RE = re.compile(r"^(\S+)\s+(\d+)\s+(\d+)\s+[\d.]+%\s+\d+\s+\d+\s+[\d.]+%\s+(\d+)\s+(\d+)\s+([\d.]+)%")


def parse_report(text):
    """Yield (filename, lines_cover_pct)."""
    for line in text.splitlines():
        m = LINE_RE.match(line.strip())
        if m:
            yield m.group(1), float(m.group(6))


def main():
    text = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    rows = dict(parse_report(text))
    if "TOTAL" not in rows:
        print("FAIL: could not parse llvm-cov summary (no TOTAL row)")
        return 1
    failures = []
    total = rows["TOTAL"]
    if total < TOTAL_FLOOR:
        failures.append(f"TOTAL lines {total:.2f}% < floor {TOTAL_FLOOR}%")
    for prefix, floor in FLOORS.items():
        for fname, cover in rows.items():
            if fname.startswith(prefix) and cover < floor:
                failures.append(f"{fname} lines {cover:.2f}% < floor {floor}%")
    if failures:
        for f in failures:
            print("FAIL:", f)
        return 1
    print(
        f"PASS: coverage gate — TOTAL {total:.2f}% >= {TOTAL_FLOOR}%; "
        f"all {len(FLOORS)} crate floors met "
        f"(excluded: {', '.join(EXCLUDED_PREFIXES)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
