#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml==6.0.2", "jsonschema==4.23.0"]
# ///
"""SOVIR backend contract gate.

Validates, honestly:
  1. The development OpenAPI document parses and exposes the declared paths.
  2. The ``$ref`` from OpenAPI to the ObservedEvent JSON Schema resolves.
  3. The schema keeps the consent and closed-shape invariants.
  4. Every ObservedEvent fixture under tests/backend/fixtures/ validates
     against the schema AND respects the fixture data policy (synthetic
     metadata only: never SECRET class, never a payload_ref).
  5. tests/fixtures/synthetic_cases.json keeps the scenario envelope.

Run with ``uv run scripts/contract_check.py`` (dependencies are pinned in the
PEP 723 header). ``--self-test`` additionally proves the checks are not
vacuous by asserting deliberately-invalid documents are rejected.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
OPENAPI = ROOT / "packages/contracts/openapi/backend-dev.v0.yaml"
SCHEMA = ROOT / "packages/contracts/schemas/observed-event.schema.json"
FIXTURE_DIR = ROOT / "tests/backend/fixtures"
SYNTHETIC_CASES = ROOT / "tests/fixtures/synthetic_cases.json"

EXPECTED_PATHS = {
    "/health/live": {"get"},
    "/v1/consents": {"post"},
    "/v1/consents/{id}/revoke": {"post"},
    "/v1/events": {"post"},
}

failures: list[str] = []
checks: list[str] = []


def check(ok: bool, label: str) -> None:
    (checks if ok else failures).append(label)


def resolve_local_refs(node, base: Path, found: list[Path]) -> None:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and not ref.startswith("#") and "://" not in ref:
            found.append((base.parent / ref).resolve())
        for value in node.values():
            resolve_local_refs(value, base, found)
    elif isinstance(node, list):
        for value in node:
            resolve_local_refs(value, base, found)


def openapi_checks() -> None:
    doc = yaml.safe_load(OPENAPI.read_text(encoding="utf-8"))
    check(str(doc.get("openapi", "")).startswith("3."), "openapi: version 3.x declared")
    paths = doc.get("paths", {})
    for path, methods in EXPECTED_PATHS.items():
        ops = set((paths.get(path) or {}).keys())
        check(methods <= ops, f"openapi: {path} exposes {sorted(methods)}")
    refs: list[Path] = []
    resolve_local_refs(doc, OPENAPI, refs)
    for ref_path in refs:
        check(ref_path.is_file(), f"openapi: local $ref resolves -> {ref_path.relative_to(ROOT)}")


def schema_checks() -> Draft202012Validator:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    check(True, "schema: document is a valid Draft 2020-12 schema")
    required = set(schema.get("required", []))
    check("consent_grant_id" in required, "schema: consent_grant_id is required")
    check(schema.get("additionalProperties") is False, "schema: additionalProperties is false")
    modalities = schema.get("properties", {}).get("modality", {}).get("enum", [])
    check(len(modalities) > 0, "schema: modality enum is non-empty")
    return Draft202012Validator(schema)


def fixture_checks(validator: Draft202012Validator) -> None:
    fixtures = sorted(FIXTURE_DIR.glob("*.json"))
    check(len(fixtures) > 0, f"fixtures: found {len(fixtures)} file(s) in tests/backend/fixtures")
    for fixture in fixtures:
        name = fixture.name
        data = json.loads(fixture.read_text(encoding="utf-8"))
        errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
        check(not errors, f"fixtures: {name} conforms to ObservedEvent schema")
        for error in errors:
            failures.append(f"    {name}: {'/'.join(map(str, error.path))} {error.message}")
        check(
            data.get("sensitive_data_class") != "SECRET",
            f"fixtures: {name} never carries SECRET data class",
        )
        check(data.get("payload_ref") is None, f"fixtures: {name} never references raw payloads")


def synthetic_cases_checks() -> None:
    cases = json.loads(SYNTHETIC_CASES.read_text(encoding="utf-8"))
    required_keys = {"id", "scenario", "class", "expected_behavior", "data_policy"}
    check(isinstance(cases, list) and len(cases) > 0, f"synthetic_cases: {len(cases)} scenarios present")
    for case in cases:
        cid = case.get("id", "<missing id>")
        check(required_keys <= set(case), f"synthetic_cases: {cid} has the scenario envelope")
        check(case.get("data_policy") == "synthetic-only", f"synthetic_cases: {cid} is synthetic-only")


MIGRATIONS_DIR = ROOT / "infra/postgres/migrations"


def migration_checks() -> None:
    ups = {p.stem[:-3]: p for p in MIGRATIONS_DIR.glob("*.up.sql")}
    downs = {p.stem[:-5]: p for p in MIGRATIONS_DIR.glob("*.down.sql")}
    check(len(ups) > 0, f"migrations: {len(ups)} up migration(s) present")
    for base in sorted(ups):
        check(base in downs, f"migrations: {base} has a matching .down.sql (reversible)")
        up_sql = ups[base].read_text(encoding="utf-8")
        check(len(up_sql.strip()) > 0, f"migrations: {base}.up.sql is non-empty")
        down_sql = downs[base].read_text(encoding="utf-8") if base in downs else ""
        check(len(down_sql.strip()) > 0, f"migrations: {base}.down.sql is non-empty")


CONSOLE_API_TS = ROOT / "apps/console/lib/api.ts"
CONSOLE_ACTIONS_TS = ROOT / "apps/console/lib/actions.ts"
CONSOLE_DEVICES_TSX = ROOT / "apps/console/app/devices/page.tsx"


def _resolve_required(doc: dict, schema: dict, base: Path) -> set[str]:
    """Resolve a requestBody schema's ``required`` list across #/ refs and
    local file refs (e.g. the ObservedEvent schema lives outside the YAML)."""
    ref = schema.get("$ref")
    if isinstance(ref, str):
        if ref.startswith("#/components/schemas/"):
            schema = doc.get("components", {}).get("schemas", {}).get(ref.rsplit("/", 1)[-1], {})
        elif "://" not in ref:
            target = (base.parent / ref).resolve()
            if target.is_file():
                schema = json.loads(target.read_text(encoding="utf-8"))
    return set(schema.get("required", []))


def _collect_enums(doc: dict) -> dict[str, set[str]]:
    """Map JSON field name -> allowed enum values across the contract."""
    enums: dict[str, set[str]] = {}

    def walk(node):
        if isinstance(node, dict):
            props = node.get("properties")
            if isinstance(props, dict):
                for name, prop in props.items():
                    vals = prop.get("enum") or prop.get("items", {}).get("enum")
                    if vals:
                        enums.setdefault(name, set()).update(vals)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc)
    event_schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    walk(event_schema)
    return enums


def console_client_checks(doc: dict) -> None:
    """Drift gate: the console's server-side client may only call contract
    paths, must send every required request field, and may only use enum
    literals the contract declares (the 422 class of bug)."""
    src = CONSOLE_API_TS.read_text(encoding="utf-8")
    check(CONSOLE_API_TS.is_file(), "console: lib/api.ts present")
    paths = doc.get("paths", {})

    called: dict[str, str] = {}
    for m in re.finditer(r'call<[^>]*>\(\s*[`"]([^`"]+)', src):
        norm = re.sub(r"\$\{[^}]*\}", "", m.group(1)).split("?")[0]
        called[norm] = m.group(1)
        check(norm in paths, f"console: client path {norm} exists in OpenAPI")

    for block in re.finditer(r"export const (\w+) = [^;]+;", src, re.S):
        b = block.group(0)
        pm = re.search(r'call<[^>]*>\(\s*[`"]([^`"]+)', b)
        mm = re.search(r'method:\s*"(\w+)"', b)
        bm = re.search(r"JSON\.stringify\(\{(.*?)\}\)", b, re.S)
        if not (pm and mm and bm):
            continue
        path = re.sub(r"\$\{[^}]*\}", "", pm.group(1)).split("?")[0]
        method = mm.group(1).lower()
        sent = set(re.findall(r"([a-zA-Z_]+)\s*[:,}]", bm.group(1)))
        op = (paths.get(path) or {}).get(method) or {}
        check(bool(op), f"console: {method.upper()} {path} exists as {method.upper()} in OpenAPI")
        body_schema = (
            op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
        )
        required = _resolve_required(doc, body_schema, OPENAPI)
        missing = required - sent
        check(not missing, f"console: {method.upper()} {path} sends required fields {sorted(required)}")

    enums = _collect_enums(doc)
    all_ts = src + CONSOLE_ACTIONS_TS.read_text(encoding="utf-8") + CONSOLE_DEVICES_TSX.read_text(
        encoding="utf-8"
    )
    for field, pattern in {
        "modality": r'modality:\s*"([A-Z_]+)"',
        "sensitive_data_class": r'sensitive_data_class:\s*"([A-Z_]+)"',
        "platform": r'"(ANDROID|IOS|WINDOWS|MACOS|LINUX|BROWSER_EXTENSION)"',
        "signals": r'signals:\s*\[([^\]]*)\]',
    }.items():
        allowed = enums.get(field, set())
        literals = set(re.findall(pattern, all_ts))
        if field == "signals":
            literals = set(re.findall(r'"([A-Z_]+)"', "".join(literals)))
        bad = literals - allowed if allowed else set()
        check(not bad, f"console: {field} literals within contract enum {sorted(literals) or '[]'}")


def self_test(validator: Draft202012Validator) -> None:
    valid = json.loads((FIXTURE_DIR / "observation.synthetic.json").read_text(encoding="utf-8"))
    variants = {
        "missing consent_grant_id": {k: v for k, v in valid.items() if k != "consent_grant_id"},
        "unknown modality": {**valid, "modality": "KEYLOG_STREAM"},
        "unexpected extra property": {**valid, "screen_capture_b64": "AAAA"},
    }
    for label, doc in variants.items():
        check(validator.iter_errors(doc) is not None and any(True for _ in validator.iter_errors(doc)),
              f"self-test: schema rejects {label}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true",
                        help="also assert that invalid documents are rejected")
    args = parser.parse_args()

    openapi_doc = yaml.safe_load(OPENAPI.read_text(encoding="utf-8"))
    openapi_checks()
    validator = schema_checks()
    fixture_checks(validator)
    synthetic_cases_checks()
    migration_checks()
    console_client_checks(openapi_doc)
    if args.self_test:
        self_test(validator)

    for label in checks:
        print("PASS:", label)
    for label in failures:
        print("FAIL:", label)
    if failures:
        return 1
    print(f"PASS: {len(checks)} contract checks succeeded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
