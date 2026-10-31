# ADR-0013: Verified-identity seam — JWKS verifier and bearer dispatch (B6)

## Status
Accepted — seam only; no identity provider selected and no production
authentication claim is made.

## Context
Tenancy is currently self-declared: dev sessions mint a `Principal` whose
`tenant_id` is caller-supplied. Real multi-tenancy needs tenant identity
derived from a verified credential. The maintainer has not chosen an OIDC
provider, but the *verification boundary* can be built now — public JWKS
key material requires no API key or secret to verify against.

## Decision

1. **`IdentityVerifier` port** (`sovir-ports`): `verify(token) ->
   VerifiedIdentity{tenant_id, principal_id, expires_at_ms}`. It returns
   claims only — no scopes. Claim→scope mapping is a policy decision the
   caller makes, never the token.
2. **`JwksIdentityVerifier` adapter** (`sovir-adapters`): parses the JWT
   header, rejects non-allowlisted algorithms, selects the `kid` key from a
   JWKS document fetched through the controlled `HttpEgress` port (new
   `get` method — same fail-closed default as `post_and_receive`), verifies
   signature, issuer, audience and expiry, then reads tenant/principal from
   configured claim names. Key cache refetches once on unknown `kid`
   (rotation) then fails closed.
3. **`HttpEgress::get`**: default `Unavailable` — the recording adapter can
   never fabricate key material, so `RecordingHttpEgress` deployments fail
   closed rather than silently "verifying".
4. **Bearer dispatch** (`authenticate_bearer`): a token shaped like a JWT
   (two dots) goes ONLY to the verifier — no silent downgrade to dev
   sessions. Other token shapes resolve through the dev `SessionStore`.
   OIDC verified principals carry the dev scope set as a placeholder and an
   empty `device_id` — device binding for verified identities is unsolved
   and documented.
5. **Configuration**: `SOVIR_OIDC_JWKS_URL` + `SOVIR_OIDC_ISSUER` +
   `SOVIR_OIDC_AUDIENCE` (all three required or startup refuses; unset =
   dev sessions only), plus `SOVIR_OIDC_TENANT_CLAIM`/`_PRINCIPAL_CLAIM`
   (defaults `tenant_id`/`sub`). JWKS host must be in the egress allowlist
   and `SOVIR_HTTP_EGRESS=real`; otherwise key fetch fails closed.

## Consequences
- Verified-tenant primitives exist end to end: when configured, a JWT's
  `tenant_id` claim — not a client field — scopes every repository call.
- Dev sessions remain the default path for local/test; a production
  deployment must additionally gate the dev-session endpoint and connect
  as `sovir_app` so `SET LOCAL app.tenant_id` enforcement (tenant_tx)
  bites.
- NOT decided: provider choice, claim→scope mapping, device binding for
  OIDC principals, refresh/revocation of verified sessions, RS256/EdDSA
  key-rotation policy. Integration tests used synthetic HS256 `oct` JWKS;
  RSA/EC/EdDSA JWKs take the same code path when fetched.
- `PortError::Unauthorized` added for credential rejections; JWKS fetch
  failures propagate `Unavailable` (transient, retryable upstream).
