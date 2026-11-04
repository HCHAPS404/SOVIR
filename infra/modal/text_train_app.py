"""SOVIR text voter — multi-label signal classifier on Modal (offline, ADR-0017).

Trains a 21-label sigmoid head over the 26-signal taxonomy (the 5 structural
signals are intentionally absent — they are produced by other voters) on the
SYNTHETIC template corpus (ml/datasets/text-corpus/*.jsonl). No user content.
Base: paraphrase-multilingual-MiniLM-L12-v2 — small enough for edge/server
inference, bilingual es/en coverage.

Outputs to volume sovir-ml-out/text-v1/: model.onnx (encoder+head fused),
thresholds.json (per-signal, calibrated so benign FP <= 1%), eval-report.json.

Run: .venv-modal/Scripts/python -m modal run infra/modal/text_train_app.py
"""
import json
import pathlib

import modal

app = modal.App("sovir-text-train")

image = (
    modal.Image.debian_slim()
    .pip_install(
        "torch==2.5.1", "transformers==4.46.3", "onnx==1.17.0",
        "sentencepiece", "numpy", "scikit-learn",
    )
)

data_vol = modal.Volume.from_name("sovir-ml-data", create_if_missing=True)
out_vol = modal.Volume.from_name("sovir-ml-out", create_if_missing=True)

BASE = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


@app.function(image=image, gpu="T4", timeout=2 * 3600,
              volumes={"/data": data_vol, "/out": out_vol})
def train(epochs: int = 12, seed: int = 7) -> dict:
    import numpy as np
    import torch
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, TensorDataset
    from transformers import AutoModel, AutoTokenizer

    dev = torch.device("cuda")
    rng = torch.Generator().manual_seed(seed)

    # --- corpus --------------------------------------------------------------
    # extract to /tmp — /data is a persistent volume and stale extractions
    # from earlier runs would shadow fresh uploads
    import tarfile
    with tarfile.open("/data/text-corpus.tar") as t:
        t.extractall("/tmp", filter="data")
    corpus = pathlib.Path("/tmp/text-corpus")
    signals = sorted({
        s
        for split in ("train", "val")
        for line in (corpus / f"{split}.jsonl").read_text().splitlines()
        for s in json.loads(line)["signals"]
    })
    s2i = {s: i for i, s in enumerate(signals)}
    K = len(signals)
    print(f"signals: {K}", flush=True)

    def load(split):
        rows = [json.loads(l) for l in (corpus / f"{split}.jsonl").read_text().splitlines()]
        texts = [r["text"] for r in rows]
        Y = np.zeros((len(rows), K), dtype=np.float32)
        for i, r in enumerate(rows):
            for s in r["signals"]:
                Y[i, s2i[s]] = 1.0
        return texts, torch.tensor(Y)

    tr_texts, trY = load("train")
    va_texts, vaY = load("val")
    be_texts, beY = load("benign")
    print(f"train={len(tr_texts)} val={len(va_texts)} benign={len(be_texts)}", flush=True)

    # --- model ---------------------------------------------------------------
    tok = AutoTokenizer.from_pretrained(BASE)
    enc = AutoModel.from_pretrained(BASE).to(dev)
    head = torch.nn.Linear(enc.config.hidden_size, K).to(dev)

    def embed(texts):
        t = tok(texts, padding=True, truncation=True, max_length=128,
                return_tensors="pt").to(dev)
        h = enc(**t).last_hidden_state
        mask = t["attention_mask"].unsqueeze(-1).float()
        return (h * mask).sum(1) / mask.sum(1).clamp(min=1e-6)

    opt = torch.optim.AdamW(
        list(enc.parameters()) + list(head.parameters()), lr=2e-5, weight_decay=1e-2)
    pos_w = torch.ones(K, device=dev) * 8.0  # ~30 samples/signal — rebalance
    lossf = torch.nn.BCEWithLogitsLoss(pos_weight=pos_w)

    # frozen-embedding warmup keeps the small corpus from destroying the encoder:
    # epoch 0-1 head-only, then unfreeze
    for p in enc.parameters():
        p.requires_grad = False

    ds = TensorDataset(torch.arange(len(tr_texts)))
    dl = DataLoader(ds, batch_size=32, shuffle=True, generator=rng)
    for ep in range(epochs):
        if ep == 2:
            for p in enc.parameters():
                p.requires_grad = True
        enc.train(); head.train()
        tot = 0.0
        for (idx,) in dl:
            idx = idx.tolist()
            z = embed([tr_texts[i] for i in idx])
            loss = lossf(head(z), trY[idx].to(dev))
            opt.zero_grad(); loss.backward(); opt.step()
            tot += float(loss)
        if ep % 4 == 0 or ep == epochs - 1:
            print(f"epoch {ep} loss={tot/len(dl):.4f}", flush=True)
    enc.eval(); head.eval()

    # --- eval ------------------------------------------------------------------
    def probs(texts):
        out = []
        with torch.no_grad():
            for i in range(0, len(texts), 64):
                out.append(torch.sigmoid(head(embed(texts[i:i + 64]))).cpu())
        return torch.cat(out)

    pv, pb = probs(va_texts), probs(be_texts)
    report: dict = {"config": {"epochs": epochs, "train": len(tr_texts),
                               "val": len(va_texts), "benign": len(be_texts),
                               "base": BASE}}
    thresholds = {}
    per_sig = {}
    for s, i in s2i.items():
        # Calibrate: max F1 on val subject to benign fire-rate <= 1% for
        # this signal — the FP gate is a hard constraint, not a metric.
        best_t, best_f1 = 0.95, -1.0
        for t in np.arange(0.5, 0.99, 0.02):
            if float((pb[:, i] >= t).float().mean()) > 0.01:
                continue
            pr = (pv[:, i] >= t).float()
            tp = float((pr * vaY[:, i]).sum())
            p_ = tp / max(1e-6, float(pr.sum()))
            r_ = tp / max(1e-6, float(vaY[:, i].sum()))
            f1 = 2 * p_ * r_ / max(1e-6, p_ + r_)
            if f1 > best_f1:
                best_t, best_f1 = float(t), f1
        thresholds[s] = round(best_t, 2)
        per_sig[s] = {"thr": round(best_t, 2), "f1": round(max(0.0, best_f1), 3)}
    thr_t = torch.tensor([thresholds[s] for s in signals])
    fires = (pb >= thr_t).any(dim=1)
    report["benign_fp_rate"] = round(float(fires.float().mean()), 4)
    report["per_signal"] = per_sig
    micro_tp = float(((pv >= thr_t) * vaY).sum())
    micro_p = micro_tp / max(1e-6, float((pv >= thr_t).sum()))
    micro_r = micro_tp / max(1e-6, float(vaY.sum()))
    report["micro_precision"] = round(micro_p, 3)
    report["micro_recall"] = round(micro_r, 3)
    print(json.dumps({k: report[k] for k in ("benign_fp_rate", "micro_precision", "micro_recall")}, indent=2))

    # --- export: encoder+head fused as one ONNX -------------------------------
    class Fused(torch.nn.Module):
        def forward(self, ids, mask):
            h = enc(input_ids=ids, attention_mask=mask).last_hidden_state
            m = mask.unsqueeze(-1).float()
            z = (h * m).sum(1) / m.sum(1).clamp(min=1e-6)
            return torch.sigmoid(head(z))

    fused = Fused().eval().cpu()
    fused.requires_grad_(False)
    enc = enc.cpu(); enc.requires_grad_(False)    # enc/head are closure refs,
    head = head.cpu(); head.requires_grad_(False) # detach + move both to CPU
    dummy = tok(["x"] * 2, padding=True, return_tensors="pt")
    out_dir = pathlib.Path("/out/text-v1"); out_dir.mkdir(parents=True, exist_ok=True)
    import logging
    logging.getLogger("torch.onnx").setLevel(logging.ERROR)
    try:
        torch.onnx.export(
            fused, (dummy["input_ids"], dummy["attention_mask"]),
            str(out_dir / "model.onnx"),
            input_names=["input_ids", "attention_mask"], output_names=["signals"],
            opset_version=17,
            dynamic_axes={"input_ids": {0: "n", 1: "t"},
                          "attention_mask": {0: "n", 1: "t"},
                          "signals": {0: "n"}},
            dynamo=False,
        )
        print("onnx export ok", flush=True)
    except Exception as e:
        # print message only — full trace dumps model weights and trips
        # the 100MB output limit
        print(f"ONNX_EXPORT_FAILED: {type(e).__name__}: {str(e)[:400]}", flush=True)
        report["onnx_export"] = "FAILED"
    (out_dir / "thresholds.json").write_text(json.dumps(
        {"model_id": "sovir-onnx-text-v1", "encoder": BASE, "signals": signals,
         "thresholds": thresholds, "output": "sigmoid 0..1 per signal",
         "license": "encoder Apache-2.0 (sentence-transformers); corpus synthetic SOVIR"},
        indent=2))
    tok.save_pretrained(out_dir / "tokenizer")
    (out_dir / "eval-report.json").write_text(json.dumps(report, indent=2))
    out_vol.commit()
    print("artifacts -> /out/text-v1")
    return report


@app.local_entrypoint()
def main(epochs: int = 12):
    print(json.dumps(train.remote(epochs=epochs), indent=2))
