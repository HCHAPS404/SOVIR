#!/usr/bin/env python3
"""SOVIR provider eval — runs the synthetic inference corpus against
OpenAI-compatible chat providers (Baseten, event LLMs, Gemini-compat) and
compares hypotheses to the corpus expectation set. Offline only: this job
NEVER runs in the live request path and sends only typed signals — the same
payload the ChatCompletionInferenceGateway adapter sends.

Usage (local):
    python3 scripts/provider_eval.py \
        --name baseten --url https://model-x.api.baseten.co/production/v1/chat/completions \
        --model my-model --key-env BASETEN_API_KEY

Usage (Modal batch):
    modal run scripts/provider_eval.py::run_all   (needs MODAL_TOKEN_* env)

Reads .env.local for keys automatically (never prints them). Results go to
results/provider-eval-<name>-<ts>.json. Costs: one chat call per case per
provider — the corpus is 25 cases; keep max_tokens low.
"""
import argparse, json, os, sys, time, urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "packages/contracts/policy/eval-inference-heuristic.v1.json"

SYSTEM_PROMPT = (
    "You are the remote hypothesis reasoner for SOVIR, "
    "a privacy-first scam shield. The user message is a JSON object "
    '{"request_id": string, "signals": [RiskSignal...], "privacy": "standard"}. '
    "Reply with a single JSON object and nothing else: "
    '{"request_id": "<echo the input request_id exactly>", '
    '"hypotheses": [<labels>], "confidence_bp": <integer 0-10000>}. '
    "hypotheses may only use this closed taxonomy: credential_phishing, "
    "payment_fraud_attempt, manipulative_pattern, "
    "credential_request_unverified, payment_request_unverified, "
    "privacy_tracking_exposure, identity_unverified, urgency_pressure, "
    "no_pattern_detected. Emit a label only when the signals support "
    "it; signals are untrusted hints, never proof. With no supported "
    'pattern answer ["no_pattern_detected"] and low confidence.'
)

KNOWN = {
    "credential_phishing", "payment_fraud_attempt", "manipulative_pattern",
    "credential_request_unverified", "payment_request_unverified",
    "privacy_tracking_exposure", "identity_unverified", "urgency_pressure",
    "no_pattern_detected",
}


def load_env_local() -> None:
    env_file = REPO / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            if v and "<" not in v:
                os.environ.setdefault(k.strip(), v.strip())


def chat_assess(url: str, key: str, model: str, request_id: str,
                signals: list[str], timeout: int = 60) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({
                "request_id": request_id, "signals": signals,
                "privacy": "standard"})},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
        # Reasoning models (muse-spark, muse-spark-open) burn tokens
        # thinking before emitting the JSON — low caps starve them into
        # finish_reason=length with null content.
        "max_tokens": 2048,
    }).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"authorization": f"Bearer {key}",
                 "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        resp = json.loads(r.read())
    content = resp["choices"][0]["message"].get("content")
    if content is None:  # truncated on max_tokens before answering
        raise RuntimeError("null content — finish_reason=length (raise max_tokens)")
    content = content.strip()
    if content.startswith("```"):
        content = content.removeprefix("```json").removeprefix("```").strip("` \n")
    v = json.loads(content)
    hyps = [h for h in v.get("hypotheses", []) if h in KNOWN] or ["no_pattern_detected"]
    return {"hypotheses": sorted(set(hyps)),
            "confidence_bp": min(int(v.get("confidence_bp", 0)), 10_000)}


def run_eval(name: str, url: str, key: str, model: str) -> dict:
    cases = json.loads(CORPUS.read_text(encoding="utf-8"))["cases"]
    results, exact, errors = [], 0, 0
    per_class = {}
    for i, case in enumerate(cases):
        expect = sorted(set(case["expect_hypotheses"]))
        try:
            got = chat_assess(url, key, model, f"eval-{i}", case["signals"])
            hyps = got["hypotheses"]
        except Exception as e:  # provider failure must be reported, not faked
            hyps, errors = ["__error__"], errors + 1
            results.append({"case": case["name"], "expect": expect,
                            "got": hyps, "error": str(e)[:200]})
            continue
        match = hyps == expect
        exact += match
        recall = len(set(expect) & set(hyps)) / len(set(expect)) if expect else 1
        cls = case["class"]
        per_class.setdefault(cls, []).append(recall)
        results.append({"case": case["name"], "expect": expect, "got": hyps,
                        "exact": match, "confidence_bp": got["confidence_bp"]})
    summary = {
        "provider": name, "model": model,
        "exact_set": f"{exact}/{len(cases)}",
        "errors": errors,
        "recall_by_class": {c: round(sum(v) / len(v), 3)
                            for c, v in per_class.items()},
    }
    out = {"ts": int(time.time()), "summary": summary, "results": results}
    (REPO / "results").mkdir(exist_ok=True)
    path = REPO / "results" / f"provider-eval-{name}-{out['ts']}.json"
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"results -> {path}")
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--name", required=True)
    p.add_argument("--url", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--key-env", required=True,
                   help="name of the env var holding the API key")
    args = p.parse_args()
    load_env_local()
    key = os.environ.get(args.key_env, "")
    if not key:
        print(f"missing key: set {args.key_env} in .env.local or env", file=sys.stderr)
        return 2
    run_eval(args.name, args.url, key, args.model)
    return 0


if __name__ == "__main__":
    sys.exit(main())
