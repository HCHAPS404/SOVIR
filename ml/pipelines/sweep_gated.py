#!/usr/bin/env python3
"""Threshold sweep on BOTH gated corpora for the visual voter.

eval_vision_onnx.py fixes the threshold from prototypes.json; this runner
reuses its exact preprocess/match code while sweeping thr 0.75..0.97 so the
ship decision uses the gated corpus — the distribution the ship gate cares
about — instead of the in-job proxy.

Usage: ml/.venv/Scripts/python.exe ml/pipelines/sweep_gated.py
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import eval_vision_onnx as ev

import numpy as np
from PIL import Image
import onnxruntime as ort

ROOT = ev.ROOT
proto = json.loads((ev.ARTIFACTS / "prototypes.json").read_text())
brands = ev.load_bank(proto)
sess = ort.InferenceSession(str(ev.ARTIFACTS / "visual.onnx"), providers=["CPUExecutionProvider"])
inp, outp = sess.get_inputs()[0].name, sess.get_outputs()[0].name

def embed(img, region=None):
    e = sess.run([outp], {inp: ev.preprocess(img, region)})[0][0]
    return e / max(1e-9, float(np.linalg.norm(e)))

def best_score(e):
    s, bid = -1.0, ""
    for b in brands:
        m = float((b["rows"] * e).sum(axis=1).max())
        if m > s:
            s, bid = m, b["id"]
    return s, bid

def run(corpus_path, side):
    cases = json.loads(pathlib.Path(corpus_path).read_text())["cases"]
    scores = []
    for c in cases:
        img = Image.open(ROOT / c["screenshot"].replace("\\", "/")).convert("RGB")
        best = -1.0; bid = ""
        for reg in ev.candidate_regions(*img.size):
            e = embed(img, reg)
            s, b = best_score(e)
            if s > best:
                best, bid = s, b
        scores.append((best, bid, c))
    out = {}
    for thr in (0.75, 0.80, 0.85, 0.88, 0.90, 0.92, 0.95, 0.97):
        if side == "phish":
            hits = sum(1 for s, b, c in scores
                       if s >= thr and b == c["expect_brand"].lower()
                       and not ev.host_allowed(c["host"], next(x["domains"] for x in brands if x["id"] == b)))
            fires = sum(1 for s, b, c in scores
                        if s >= thr
                        and not ev.host_allowed(c["host"], next(x["domains"] for x in brands if x["id"] == b)))
            out[str(thr)] = {"recall": round(hits / len(scores), 4),
                             "any_signal": round(fires / len(scores), 4)}
        else:
            fp = sum(1 for s, b, c in scores
                     if s >= thr
                     and not ev.host_allowed(c["host"], next(x["domains"] for x in brands if x["id"] == b)))
            out[str(thr)] = {"benign_fp": fp, "rate": round(fp / len(scores), 4)}
    return out

print("model:", proto["model_id"])
phish = run(ev.CORPUS, "phish")
print("\nPHISH gated (region-sim, correct-brand recall / any-signal rate):")
for t, m in phish.items():
    print(f"  {t}: recall={m['recall']:.3f} any_signal={m['any_signal']:.3f}")
benign = run(ROOT / "ml/datasets/eval-corpus-vision-benign.v1.json", "benign")
print("\nBENIGN gated (region-sim FP count / rate):")
for t, m in benign.items():
    print(f"  {t}: fp={m['benign_fp']} rate={m['rate']:.3f}")
