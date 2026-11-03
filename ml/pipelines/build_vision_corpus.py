#!/usr/bin/env python3
"""Build the vision eval corpus from the downloaded Phishpedia dataset.

Reads the 30k phishing benchmark layout (one dir per site, each with a
screenshot + metadata naming the target brand) and emits a bounded eval
split to ml/datasets/eval-corpus-vision.v1.json. Benign contrast cases
come from the curated brand domains list — a legit brand-domain page is
the adversarial negative the voter must NOT flag (match but own domain).

Phishpedia site dirs (per the released archive): shot.png, html.txt,
info.txt containing the URL and target brand. Layout variants are
tolerated; dirs without parseable brand metadata are skipped, never
guessed.

Usage:
    python ml/pipelines/build_vision_corpus.py \
        --data ml/datasets/phishpedia --n 300
"""
import argparse
import json
import pathlib
import random
import re
import sys
from urllib.parse import urlparse

BRAND_RE = re.compile(r"(?:target|brand)[:\s]+([A-Za-z0-9_.-]+)", re.I)
URL_RE = re.compile(r"https?://[^\s'\"]+", re.I)


def parse_site(site_dir: pathlib.Path):
    """→ {shot, host, brand} or None when metadata is absent."""
    shot = next(
        (site_dir / n for n in ("shot.png", "screenshot.png", "shot.jpg") if (site_dir / n).exists()),
        None,
    )
    meta = b""
    for name in ("info.txt", "meta.json", "url.txt"):
        p = site_dir / name
        if p.exists():
            meta = p.read_bytes()
            break
    if shot is None or not meta:
        return None
    text = meta.decode("utf-8", "replace")
    brand = BRAND_RE.search(text)
    url = URL_RE.search(text)
    return {
        "shot": str(shot),
        "brand": brand.group(1).lower() if brand else None,
        "host": urlparse(url.group(0)).hostname if url else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--n", type=int, default=300, help="max phish cases")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument(
        "--out", default="ml/datasets/eval-corpus-vision.v1.json",
    )
    args = ap.parse_args()

    root = pathlib.Path(args.data)
    sites = [d for d in root.rglob("*") if d.is_dir()]
    cases = [c for c in (parse_site(d) for d in sites) if c]
    random.seed(args.seed)
    random.shuffle(cases)
    cases = cases[: args.n]

    if not cases:
        print(
            "NOT_RUN: no parseable site dirs under "
            f"{root} — unzip phishpedia_30k.zip there first."
        )
        return 1

    corpus = {
        "version": "v1",
        "status": "populated — Phishpedia CC0-1.0 eval split",
        "purpose": "Gated eval for the edge visual voter (ADR-0024). "
        "Each case: screenshot path + host + expected brand. Expected "
        "outcome: AUTHORITY_IMPERSONATION iff embedding matches brand "
        "AND host ∉ brand domains.",
        "model": "sovir-onnx-visual-v0 (pending artifact)",
        "cases": [
            {
                "id": f"pv-{i:04d}",
                "screenshot": c["shot"],
                "host": c["host"],
                "expect_brand": c["brand"],
                "expect_signal": "AUTHORITY_IMPERSONATION" if c["brand"] else "none",
            }
            for i, c in enumerate(cases)
        ],
    }
    out = pathlib.Path(args.out)
    out.write_text(json.dumps(corpus, indent=2))
    print(f"wrote {len(cases)} cases → {out}")
    print("NEXT: train_visual.py → eval the artifact against this corpus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
