# @sovir/client-sdk

Generated typed client for `backend-dev.v0` (the loopback SOVIR API).

- **Generated, not hand-written**: `uv run scripts/gen_client_sdk.py`
  rewrites `src/` from `packages/contracts/openapi/backend-dev.v0.yaml`
  plus `observed-event.schema.json`. `--check` fails when the output is
  stale — CI runs it, so drift is caught at review time.
- **Thin by design**: one method per contract operation, types derived
  from component schemas. Anything the contract doesn't describe is
  `unknown` — the SDK never invents shapes.
- **Token hygiene**: the client never persists or logs the bearer token;
  the caller decides storage (console BFF uses an httpOnly cookie, native
  clients keep it in memory).
- `ingestEvent` enforces the mandatory `Idempotency-Key` header at the
  signature level — it cannot be omitted.

## Usage

```ts
import { SovirClient } from "@sovir/client-sdk";

const api = new SovirClient("http://127.0.0.1:8787");
const session = await api.devSession({ principal_id: "console-demo" });
const authed = new SovirClient("http://127.0.0.1:8787", session.token);
const devices = await authed.listDevices();
```

## Verify

```
uv run scripts/gen_client_sdk.py --check   # generated output fresh?
pnpm --filter @sovir/client-sdk typecheck  # types compile?
```
