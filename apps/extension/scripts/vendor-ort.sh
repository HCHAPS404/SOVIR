#!/usr/bin/env bash
# Vendor onnxruntime-web into apps/extension/ort/ — pinned to 1.16.3.
#
# Why this pin matters (measured 2026-11-03 in a real MV3 service worker):
#   * ort 1.20.x loads its wasm glue via dynamic `import()` — BANNED by the
#     HTML spec on ServiceWorkerGlobalScope (W3C issue #1356). Not a CSP
#     issue: no policy can allow it.
#   * ort 1.16.x instantiates wasm via fetch + WebAssembly.instantiate —
#     the only wasm path a classic MV3 worker can run.
#   * numThreads=1 selects ort-wasm-simd.wasm (single-threaded). The
#     threaded build needs SharedArrayBuffer → crossOriginIsolated, which
#     MV3 extensions never get. We ship ONLY the simd single-threaded wasm.
#
# Usage: bash apps/extension/scripts/vendor-ort.sh
set -euo pipefail
ORT_VERSION="1.16.3"
DEST="$(cd "$(dirname "$0")/.." && pwd)/ort"
BASE="https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist"
mkdir -p "$DEST"
for f in ort.wasm.min.js ort-wasm-simd.wasm; do
  curl -fsSL -o "$DEST/$f" "$BASE/$f"
  echo "vendored $f ($(wc -c < "$DEST/$f") bytes)"
done
echo "onnxruntime-web ${ORT_VERSION} vendored → $DEST"
