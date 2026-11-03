#!/usr/bin/env python3
"""Build the edge visual voter artifacts for the extension (ADR-0024).

Architecture decision (pixels never egress): the learned voter runs in
the extension worker, NOT in the server council. What ships inside the
extension package:

    models/visual.onnx      — embedding encoder (MobileNetV3-Small,
                              ImageNet-pretrained, int8 where possible)
    models/prototypes.json  — per-brand prototype vectors + each brand's
                              legit domains, produced HERE from the
                              Phishpedia logo targetlist

The voter emits AUTHORITY_IMPERSONATION only when frame ≈ brand vector
AND page host ∉ brand domains — detection needs no classifier head, so
there is nothing to fine-tune and no phishing labels are consumed for
weights. The 30k benchmark is for EVAL only (build_vision_corpus).

Prereqs (dev machine only, NOT repo deps):
    pip install torch torchvision onnx onnxruntime pillow

Pipeline:
  1. python ml/pipelines/fetch_phishpedia.py        # dataset (gdown)
  2. unzip phishpedia_30k.zip into ml/datasets/phishpedia/
     + place the Phishpedia expand_targetlist (per-brand logo PNGs)
     under ml/datasets/phishpedia/targetlist/<brand>/
  3. python ml/pipelines/train_visual.py \
        --logos ml/datasets/phishpedia/targetlist \
        --domains ml/brand-domains.json \
        --out ml/artifacts/onnx-visual/
  4. Copy artifacts into apps/extension/models/ ONLY after the eval
     corpus + license/provenance + human signoff (AGENTS.md inv. 8).

STATUS: pipeline implemented; artifact NOT_RUN — dataset + torch are a
dev-machine job pending GPU/time approval.
"""
import argparse
import json
import pathlib
import sys

INPUT_DIM = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def embed_dir(encoder, transform, logo_dir: pathlib.Path):
    """Mean embedding over a brand's logo images → prototype vector."""
    import torch
    from PIL import Image

    vecs = []
    for img_path in sorted(logo_dir.glob("*.png")) + sorted(
        logo_dir.glob("*.jpg")
    ):
        img = transform(Image.open(img_path).convert("RGB")).unsqueeze(0)
        with torch.no_grad():
            vecs.append(encoder(img)[0])
    if not vecs:
        return None
    v = torch.stack(vecs).mean(0)
    return (v / v.norm()).tolist()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--logos", required=True, help="targetlist/<brand>/*.png")
    ap.add_argument(
        "--domains",
        required=True,
        help='{"brand": ["domain.tld", ...]} — curated, hand-verified',
    )
    ap.add_argument("--out", default="ml/artifacts/onnx-visual")
    args = ap.parse_args()

    try:
        import torch
        import torchvision.models as tvm
        import torchvision.transforms as T
    except ImportError:
        print("torch/torchvision required (dev machine only) — NOT_RUN")
        return 1

    logos = pathlib.Path(args.logos)
    domains = json.loads(pathlib.Path(args.domains).read_text())
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # ImageNet-pretrained encoder — a public, licensed feature extractor;
    # NO phishing training (the voter matches brand identity, it does not
    # classify "phish").
    weights = tvm.MobileNet_V3_Small_Weights.DEFAULT
    net = weights.transforms() and tvm.mobilenet_v3_small(weights=weights)
    encoder = torch.nn.Sequential(net.features, net.avgpool, torch.nn.Flatten())
    encoder.eval()

    transform = T.Compose(
        [T.Resize((INPUT_DIM, INPUT_DIM)), T.ToTensor(), T.Normalize(MEAN, STD)]
    )

    brands = []
    for brand_dir in sorted(p for p in logos.iterdir() if p.is_dir()):
        brand = brand_dir.name
        if brand not in domains:
            print(f"skip {brand}: no curated domains")
            continue
        vec = embed_dir(encoder, transform, brand_dir)
        if vec is None:
            print(f"skip {brand}: no logo images")
            continue
        brands.append({"id": brand, "domains": domains[brand], "vector": vec})
        print(f"prototype {brand}: {len(vec)}d")

    if not brands:
        print("no prototypes produced — NOT_RUN")
        return 1

    # Export the encoder to ONNX (float32; int8 quantize as a follow-up
    # with onnxruntime.quantization once the eval corpus exists).
    dummy = torch.zeros(1, 3, INPUT_DIM, INPUT_DIM)
    onnx_path = out / "visual.onnx"
    torch.onnx.export(
        encoder,
        dummy,
        str(onnx_path),
        input_names=["input"],
        output_names=["emb"],
        opset_version=17,
        dynamic_axes={"input": {0: "n"}, "emb": {0: "n"}},
    )

    proto = {
        "model_id": "sovir-onnx-visual-v0",
        "encoder": "mobilenet_v3_small-imagenet",
        "input": {"dim": INPUT_DIM, "mean": MEAN, "std": STD},
        "threshold_bp": 6500,
        "brands": brands,
        "license": "encoder BSD-3 (torchvision weights); prototypes derived CC0-1.0 Phishpedia",
    }
    (out / "prototypes.json").write_text(json.dumps(proto, indent=2))
    print(f"wrote {onnx_path} + prototypes.json ({len(brands)} brands)")
    print(
        "NEXT: eval corpus (build_vision_corpus.py) → gated eval → "
        "license/provenance signoff → copy into apps/extension/models/"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
