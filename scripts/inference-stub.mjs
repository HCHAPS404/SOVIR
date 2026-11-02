// SOVIR inference provider stub — OpenAI-compatible chat/completions shape.
// Lets the real remote-inference path (egress → ChatCompletionInferenceGateway
// → taxonomy filter → budget ledger) be verified end-to-end without spending
// provider credits. Deterministic rules map signals → the same closed
// hypothesis taxonomy the remote model is instructed to emit.
//
//   node scripts/inference-stub.mjs [port]
//   STUB_ROGUE=1  → appends an out-of-taxonomy label to prove filtering
//   STUB_LOG=1    → logs request_id + usage per call (token accounting demo)
//
// Env for the API side:
//   SOVIR_HTTP_EGRESS=real
//   SOVIR_INFERENCE_URL=http://127.0.0.1:8795/v1/chat/completions
//   SOVIR_INFERENCE_KEY=stub-key  SOVIR_INFERENCE_MODEL=stub-v0
//   SOVIR_INFERENCE_API=openai-chat  SOVIR_INFERENCE_ALLOWLIST=127.0.0.1
//   SOVIR_INFERENCE_BUDGET_USD=<cap>

import { createServer } from "node:http";

const PORT = Number(process.argv[2] || 8795);
const ROGUE = process.env.STUB_ROGUE === "1";
const LOG = process.env.STUB_LOG === "1";

// Signal → hypothesis mapping mirroring the heuristic rules; a real
// provider reasons semantically over the same taxonomy.
const RULES = [
  ["SEED_PHRASE_REQUEST", "credential_phishing", 9200],
  ["CREDENTIAL_REQUEST", "credential_phishing", 7600],
  ["PAYMENT_REQUEST", "payment_fraud_attempt", 7400],
  ["GIFT_CARD_PAYMENT", "payment_fraud_attempt", 7100],
  ["EXTORTION_LANGUAGE", "manipulative_pattern", 8300],
  ["URGENT_ACTION", "urgency_pressure", 6200],
  ["SCAREWARE_CLAIM", "manipulative_pattern", 6800],
  ["LINK_DESTINATION_MISMATCH", "credential_phishing", 7000],
  ["TRACKING_OBSERVED", "privacy_tracking_exposure", 5500],
  ["IDENTITY_UNVERIFIED", "identity_unverified", 5000],
  ["QR_PRESENT", "qr_phishing_lure", 4600],
];
const KNOWN = new Set([
  "credential_phishing", "payment_fraud_attempt", "manipulative_pattern",
  "credential_request_unverified", "payment_request_unverified",
  "privacy_tracking_exposure", "identity_unverified", "urgency_pressure",
  "qr_phishing_lure", "no_pattern_detected",
]);

function verdictFor(req) {
  const signals = Array.isArray(req.signals) ? req.signals : [];
  const hyps = [];
  let conf = 3500;
  for (const [sig, label, c] of RULES) {
    if (signals.includes(sig) && !hyps.includes(label)) {
      hyps.push(label);
      conf = Math.max(conf, c);
    }
  }
  if (!hyps.length) {
    hyps.push("no_pattern_detected");
    conf = 900;
  }
  if (ROGUE) hyps.push("out_of_taxonomy_label");
  return {
    request_id: req.request_id,
    hypotheses: hyps.filter((h) => ROGUE || KNOWN.has(h)),
    confidence_bp: conf,
  };
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/v1/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  for await (const c of req) raw += c;
  try {
    const body = JSON.parse(raw);
    const user = body.messages?.find((m) => m.role === "user");
    const payload = JSON.parse(user?.content ?? "{}");
    const verdict = verdictFor(payload);
    const promptTokens = Math.ceil(raw.length / 4);
    const completionTokens = Math.ceil(JSON.stringify(verdict).length / 4);
    if (LOG)
      console.log(
        `stub req:${payload.request_id} signals:${(payload.signals || []).length} -> ${verdict.hypotheses.join("+")} (${promptTokens}+${completionTokens} tok est)`,
      );
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        id: `stub-${Date.now()}`,
        object: "chat.completion",
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(verdict) },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      }),
    );
  } catch (e) {
    res.writeHead(400).end(JSON.stringify({ error: String(e) }));
  }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`inference-stub listening on http://127.0.0.1:${PORT}/v1/chat/completions${ROGUE ? " [ROGUE]" : ""}`);
});
