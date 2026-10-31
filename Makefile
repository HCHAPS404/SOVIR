.PHONY: doctor bootstrap check verify-architecture eval test benchmark design-check
PYTHON ?= python3

doctor:
	$(PYTHON) scripts/harness.py doctor
bootstrap: doctor
	@echo "Scaffold documental listo. Inicializa los proyectos por tickets; no se instalan toolchains automáticamente."
check:
	$(PYTHON) scripts/harness.py check
verify-architecture:
	$(PYTHON) scripts/check_architecture.py
eval:
	$(PYTHON) scripts/harness.py eval
test: check eval design-check backend-check
benchmark:
	$(PYTHON) scripts/harness.py benchmark

design-check:
	$(PYTHON) scripts/design_harness.py

# cmd.exe no acepta VAR=valor comando. En Windows se usa set.
ifeq ($(OS),Windows_NT)
REQUIRE_RUST = set SOVIR_BACKEND_REQUIRE_RUST=1&&
else
REQUIRE_RUST = SOVIR_BACKEND_REQUIRE_RUST=1
endif

.PHONY: backend-check backend-run backend-smoke contract-check
contract-check:
	uv run scripts/contract_check.py --self-test

backend-check:
	$(REQUIRE_RUST) $(PYTHON) scripts/backend_harness.py

.PHONY: backend-scaffold-check
backend-scaffold-check:
	$(PYTHON) scripts/backend_harness.py
backend-run:
	cargo run -p sovir-api
backend-smoke:
	$(PYTHON) scripts/backend_demo.py
