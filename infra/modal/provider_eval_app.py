"""SOVIR provider eval as a Modal batch job (offline compute, ADR-0017).

Runs the synthetic corpus against OpenAI-compatible providers in Modal's
cloud — the sponsor-visible version of `scripts/provider_eval.py`. Offline
only: this is never the live request path, and the payload is typed signals
exactly as the ChatCompletionInferenceGateway sends.

Setup (once):  pip install modal && modal token set --token-id $MODAL_TOKEN_ID \
               --token-secret $MODAL_TOKEN_SECRET
Run:           modal run infra/modal/provider_eval_app.py::run \
               --name baseten --url https://model-x.api.baseten.co/production/v1/chat/completions \
               --model my-model --key-env BASETEN_API_KEY
Secrets:       pass provider keys via Modal secret or env — never in code.
"""
import json, os, sys

app_name = "sovir-provider-eval"

try:
    import modal

    app = modal.App(app_name)
    img = modal.Image.debian_slim()

    @app.function(image=img, timeout=900)
    def run(name: str, url: str, model: str, key_env: str) -> str:
        sys.path.insert(0, os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)))))
        from scripts.provider_eval import run_eval  # noqa: E402
        key = os.environ.get(key_env, "")
        if not key:
            return json.dumps({"error": f"missing env {key_env} in Modal secret"})
        out = run_eval(name, url, key, model)
        return json.dumps(out["summary"])

except ImportError:  # modal not installed locally — file still documents usage
    app = None

    def run(*_a, **_k):  # type: ignore
        raise SystemExit("modal SDK not installed — pip install modal first")
