"""SOVIR visual voter — siamese fine-tune on Modal (offline compute, ADR-0017).

The ImageNet encoder's weakness is measured: brand logos on foreign domains
match at ~3% recall @0.90 cosine. This job reshapes the SAME MobileNetV3-Small
embedding space with contrastive pairs built from the public Phishpedia
corpus (targetlist logos + phish_30k logo crops via its shipped yolo bboxes)
plus our benign-logo corpus as hard negatives. No user content is used — the
corpus is public research data (invariant: synthetic/public fixtures only).

Data: packed by infra/modal/prep_visual_data.py -> volume sovir-ml-data.
Out:  artifacts land in volume sovir-ml-out/visual-v1/ (visual.onnx,
      prototypes.json, eval-report.json). Download with:
      .venv-modal/Scripts/python -m modal volume get sovir-ml-out /visual-v1 ml/artifacts/

Run:  .venv-modal/Scripts/python -m modal run infra/modal/visual_train_app.py
"""
import json
import pathlib
import random
import tarfile

import modal

app = modal.App("sovir-visual-train")

image = (
    modal.Image.debian_slim()
    .pip_install("torch==2.5.1", "torchvision==0.20.1", "onnx==1.17.0", "pillow", "numpy")
)

data_vol = modal.Volume.from_name("sovir-ml-data", create_if_missing=True)
out_vol = modal.Volume.from_name("sovir-ml-out", create_if_missing=True)

INPUT_DIM = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
EMB = 576


def _unpack(workdir: pathlib.Path) -> pathlib.Path:
    dst = workdir / "x"
    if not dst.exists():
        dst.mkdir(parents=True)
        with tarfile.open(workdir / "visual-data.tar") as tar:
            tar.extractall(dst, filter="data")
    return dst


@app.function(
    image=image,
    gpu="T4",
    timeout=4 * 3600,
    volumes={"/data": data_vol, "/out": out_vol},
)
def train(epochs: int = 10, max_crops: int = 6000, seed: int = 7) -> dict:
    import base64
    import io

    import torch
    import torch.nn.functional as F
    import torchvision.models as tvm
    import torchvision.transforms as T
    from PIL import Image

    print("train() entered", flush=True)
    rng = random.Random(seed)
    dev = torch.device("cuda")
    root = _unpack(pathlib.Path("/data"))
    print("unpacked data", flush=True)
    tf = T.Compose([T.Resize((INPUT_DIM, INPUT_DIM)), T.ToTensor(), T.Normalize(MEAN, STD)])
    tf_aug = T.Compose(
        [
            T.Resize((INPUT_DIM, INPUT_DIM)),
            T.RandomAffine(degrees=4, scale=(0.85, 1.15), translate=(0.05, 0.05)),
            T.ColorJitter(brightness=0.15, contrast=0.15),
            T.ToTensor(),
            T.Normalize(MEAN, STD),
        ]
    )

    def norm(name: str) -> str:
        return " ".join(name.replace("_", " ").replace("-", " ").split()).lower()

    # --- load targetlist anchors -------------------------------------------
    anchors: dict[str, list[pathlib.Path]] = {}
    for bdir in sorted((root / "targetlist").iterdir()):
        if not bdir.is_dir():
            continue
        imgs = sorted(bdir.glob("*.png")) + sorted(bdir.glob("*.jpg"))
        if imgs:
            anchors[norm(bdir.name)] = imgs
    print(f"anchors: {len(anchors)} brands, {sum(map(len, anchors.values()))} imgs")

    # --- load phish crops (top-1 yolo box, conf>=0.85, 10% pad) --------------
    crops: list[tuple[Image.Image, str]] = []
    brand_dirs = {norm(b): b for b in anchors}
    case_dirs = sorted((root / "phish").iterdir())
    rng.shuffle(case_dirs)
    held_out: list[tuple[Image.Image, str, str]] = []  # (crop, brand, case)

    def top_crop(case: pathlib.Path):
        best = None
        for line in (case / "yolo_coords.txt").read_text().splitlines():
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            x1, y1, x2, y2 = eval(parts[0])
            conf = float(parts[1])
            if conf >= 0.85 and (best is None or conf > best[0]):
                best = (conf, x1, y1, x2, y2)
        if best is None:
            return None
        img = Image.open(case / "shot.png").convert("RGB")
        W, H = img.size
        _, x1, y1, x2, y2 = best
        px, py = (x2 - x1) * 0.10, (y2 - y1) * 0.10
        crop = img.crop(
            (max(0, x1 - px), max(0, y1 - py), min(W, x2 + px), min(H, y2 + py))
        )
        return crop, (x1, y1, x2, y2), img

    def bg_tile(img: Image.Image, logo_box, size=160):
        """Random tile that does NOT overlap the logo bbox — the negative
        the runtime actually needs: page regions that are not a logo."""
        W, H = img.size
        lx1, ly1, lx2, ly2 = logo_box
        for _ in range(12):
            x1 = rng.randint(0, max(1, W - size))
            y1 = rng.randint(0, max(1, H - size))
            x2, y2 = x1 + size, y1 + size
            ov_x = max(0, min(x2, lx2) - max(x1, lx1))
            ov_y = max(0, min(y2, ly2) - max(y1, ly1))
            if ov_x * ov_y < 0.02 * size * size:
                return img.crop((x1, y1, x2, y2))
        return None

    background: list[Image.Image] = []

    n_hold = max(1, int(0.2 * max_crops))
    for case in case_dirs:
        if len(crops) + len(held_out) >= max_crops + n_hold:
            break
        brand = norm(case.name.rsplit("+", 1)[0])
        if brand not in brand_dirs:
            continue
        got = top_crop(case)
        if got is None:
            continue
        crop, logo_box, shot = got
        if min(crop.size) < 16:
            continue
        if len(background) < 4000:
            tile = bg_tile(shot, logo_box)
            if tile is not None and min(tile.size) >= 32:
                background.append(tile)
        if len(held_out) < n_hold and rng.random() < 0.2:
            held_out.append((crop, brand, case.name))
        elif len(crops) < max_crops:
            crops.append((crop, brand))
    print(f"crops: {len(crops)} train, {len(held_out)} held-out")

    # --- benign hard negatives ---------------------------------------------
    benign = [Image.open(p).convert("RGB") for p in sorted((root / "benign").glob("*.*"))]
    print(f"benign: {len(benign)}")

    # --- model --------------------------------------------------------------
    weights = tvm.MobileNet_V3_Small_Weights.DEFAULT
    net = tvm.mobilenet_v3_small(weights=weights)
    encoder = torch.nn.Sequential(net.features, net.avgpool, torch.nn.Flatten()).to(dev)

    def emb(t: torch.Tensor) -> torch.Tensor:
        return F.normalize(encoder(t), dim=1)

    opt = torch.optim.AdamW(encoder.parameters(), lr=3e-5, weight_decay=1e-4)
    # Round-1 margin 0.55 left cross-brand sims ~0.85 hugging the 0.88 ship
    # boundary (17.7% cross-FP on the logo sweep). 0.32 forces the gap open.
    margin = 0.32

    anchors_t = {b: [tf(Image.open(p).convert("RGB")) for p in imgs[:12]]
                 for b, imgs in anchors.items()}
    all_brands = sorted(anchors_t)
    crops_t = [(tf_aug(c), b) for c, b in crops]
    benign_t = [tf(b) for b in benign]
    crops_by_brand: dict[str, list[torch.Tensor]] = {}
    for t, cb in crops_t:
        crops_by_brand.setdefault(cb, []).append(t)
    brands_with_crops = sorted(crops_by_brand)
    bg_t = [tf(b) for b in background]
    print(f"background negatives: {len(bg_t)}", flush=True)

    def pos_pair() -> tuple[torch.Tensor, torch.Tensor]:
        b = rng.choice(all_brands)
        pool = anchors_t[b]
        if b in crops_by_brand and rng.random() < 0.5:
            return rng.choice(pool), rng.choice(crops_by_brand[b])
        a, c = rng.sample(pool, 2) if len(pool) >= 2 else (pool[0], pool[0])
        return a, c

    def neg_pair() -> tuple[torch.Tensor, torch.Tensor]:
        a, b = rng.sample(all_brands, 2)
        r = rng.random()
        if r < 0.35 and bg_t:  # page regions that are not logos — the FP class
            return rng.choice(anchors_t[a]), rng.choice(bg_t)
        if r < 0.55 and b in crops_by_brand:
            return rng.choice(anchors_t[a]), rng.choice(crops_by_brand[b])
        if r < 0.75 and benign_t:
            return rng.choice(anchors_t[a]), rng.choice(benign_t)
        return rng.choice(anchors_t[a]), rng.choice(anchors_t[b])

    # --- train ----------------------------------------------------------------
    steps = min(60_000, max(4_000, len(crops_t) * 10))
    encoder.train()
    for step in range(steps):
        (pa, pb), (na, nb) = pos_pair(), neg_pair()
        x = torch.stack([pa, pb, na, nb]).to(dev)
        e = emb(x)
        pos = F.cosine_similarity(e[0:1], e[1:2])
        neg = F.cosine_similarity(e[2:3], e[3:4])
        loss = (1 - pos).mean() + F.relu(neg - margin).mean()
        opt.zero_grad(); loss.backward(); opt.step()
        if step % 5000 == 0:
            print(f"step {step}/{steps} loss={loss.item():.4f} pos={pos.item():.3f} neg={neg.item():.3f}")
    encoder.eval()

    # --- prototypes with the NEW encoder -------------------------------------
    proto_vecs: dict[str, torch.Tensor] = {}
    with torch.no_grad():
        for b, imgs in anchors_t.items():
            v = emb(torch.stack(imgs).to(dev))
            proto_vecs[b] = v

    def match(e: torch.Tensor) -> tuple[str, float]:
        best_b, best_s = "", -1.0
        for b, v in proto_vecs.items():
            s = float((v * e).sum(dim=1).max())
            if s > best_s:
                best_b, best_s = b, s
        return best_b, best_s

    # --- eval gates ------------------------------------------------------------
    report: dict = {"config": {"epochs": epochs, "steps": steps, "margin": margin,
                               "crops": len(crops_t), "held_out": len(held_out),
                               "brands": len(all_brands), "benign": len(benign_t)}}
    with torch.no_grad():
        hc = [emb(tf(c).unsqueeze(0).to(dev))[0] for c, _, _ in held_out]
        be = [emb(tf(b).unsqueeze(0).to(dev))[0] for b in benign]
        bg = [emb(t.unsqueeze(0).to(dev))[0] for t in bg_t[:500]]
    sweep = {}
    for thr in (0.80, 0.85, 0.88, 0.90, 0.92, 0.95):
        hits = sum(1 for e, (c, b, _) in zip(hc, held_out) if match(e)[0] == b and match(e)[1] >= thr)
        fp = sum(1 for e in be if match(e)[1] >= thr)
        bg_fp = sum(1 for e in bg if match(e)[1] >= thr)
        sweep[str(thr)] = {
            "phish_recall": round(hits / max(1, len(hc)), 4),
            "benign_fp": fp,
            "benign_fp_rate": round(fp / max(1, len(be)), 4),
            "bg_tile_fp_rate": round(bg_fp / max(1, len(bg)), 4),
        }
    report["sweep"] = sweep
    # ship threshold: highest recall with benign_fp_rate <= 2% AND bg tiles <= 5%
    ship = max((float(t) for t, m in sweep.items()
                if m["benign_fp_rate"] <= 0.02 and m["bg_tile_fp_rate"] <= 0.05),
               key=lambda t: sweep[str(t)]["phish_recall"], default=None)
    report["ship_threshold"] = ship
    print(json.dumps(report["sweep"], indent=2), "ship:", ship)

    # --- artifacts --------------------------------------------------------------
    out_dir = pathlib.Path("/out/visual-v1")
    out_dir.mkdir(parents=True, exist_ok=True)

    brands_meta = json.loads((root / "meta/brand-domains.json").read_text()) \
        if (root / "meta/brand-domains.json").exists() else {}
    domain_by_norm = {norm(k): v for k, v in brands_meta.items()}
    brands = []
    for b in all_brands:
        v = proto_vecs[b]
        q = (v * 127).round().clamp(-127, 127).to(torch.int8).cpu()
        brands.append({
            "id": brand_dirs[b], "domains": domain_by_norm.get(b, []),
            "n_imgs": len(anchors_t[b]),
            "vectors_i8_b64": base64.b64encode(q.numpy().tobytes()).decode("ascii"),
        })
    proto = {
        "model_id": "sovir-onnx-visual-v1",
        "encoder": "mobilenet_v3_small-siamese-phishpedia",
        "embedding_dim": EMB,
        "input": {"dim": INPUT_DIM, "mean": MEAN, "std": STD},
        "threshold_bp": int((ship or 0.90) * 10000),
        "quantization": "int8 x/127 per vector, row-major (n_imgs × 576)",
        "brands": brands,
        "license": "encoder BSD-3 (torchvision weights); fine-tuned on CC0-1.0 Phishpedia",
    }
    (out_dir / "prototypes.json").write_text(json.dumps(proto, indent=2))

    dummy = torch.zeros(1, 3, INPUT_DIM, INPUT_DIM, device=dev)
    torch.onnx.export(
        encoder, dummy, str(out_dir / "visual.onnx"),
        input_names=["input"], output_names=["emb"], opset_version=17,
        dynamic_axes={"input": {0: "n"}, "emb": {0: "n"}}, dynamo=False,
    )
    (out_dir / "eval-report.json").write_text(json.dumps(report, indent=2))
    out_vol.commit()
    print(f"artifacts -> /out/visual-v1 ({len(brands)} brands)")
    return report


@app.local_entrypoint()
def main(epochs: int = 10, max_crops: int = 6000):
    report = train.remote(epochs=epochs, max_crops=max_crops)
    print(json.dumps(report, indent=2))
