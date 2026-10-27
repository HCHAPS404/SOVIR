# Backend developer bootstrap

Requirements: Rust stable toolchain with cargo, rustfmt, clippy; Python 3.11+.

Deferred on purpose: `docs/operations/DEFERRED_TOOLCHAINS.md`. Do not install Docker, Postgres, Java, Android SDK, Xcode, Flutter or remote model providers until the milestone named there.

```bash
# from sovir_starter/
make doctor
make backend-check
export SOVIR_API_DEV_TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"
make backend-run
# in a second terminal (same token environment):
make backend-smoke
```

- The server listens ONLY on 127.0.0.1:8787; refuses public interfaces.
- `SOVIR_ALLOW_REMOTE_INFERENCE=true` makes startup fail (not silently enabled).
- Grant state and event deduplication live in memory and disappear on restart.
- The token is a single developer secret, not multi-user auth; never deploy publicly.
- The smoke script sends only synthetic metadata. No images, conversations or credentials.

Production requires dedicated auth, devices, permissions, durable storage, TLS,
audit, RLS, retention, high availability and security signoff.
