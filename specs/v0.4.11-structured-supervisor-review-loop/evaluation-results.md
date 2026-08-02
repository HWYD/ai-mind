# v0.4.11 Evaluation Results

## Frozen deterministic harness

- Manifest: `schemaVersion: 1`, `scorerVersion: v1`.
- Cases: 8 frozen cases covering direct pass, clarification, one revision, Boundary/Risk blockers, one/two/all Reviewer failures.
- Baselines: `single-agent`, `fixed-multi-agent-current`, `structured-supervisor-v0.4.11`.
- Deterministic test-side adapters produced 24 safe result records (8 cases × 3 baselines), with canonical statuses and no hard-rule failures.
- The recorded adapter metrics intentionally cover only call-count shape. They are not a substitute for real model quality, latency, token, or cost measurements.

## Local validation

- Targeted model/provider, Contract, review-loop, manager-run, route, evaluation-harness and orchestrator suites passed.
- `pnpm --dir apps/webapp typecheck` passed.
- `pnpm --dir apps/webapp lint` passed (0 errors, 5 pre-existing react-refresh warnings).
- `pnpm test:stable` passed: **130 test files, 908 tests** (2026-08-01).

## External-model limitation and release gate

The deterministic contract/policy/status/loop/evaluation-harness suites all pass against frozen fixtures. The 8-case × 3-baseline external quality/cost comparison requires running against real providers (DeepSeek business + Contract models) and is deferred to a separate evaluation session. The deterministic test-side adapters and harness are in place and ready for that session.

Consequently, the required external-model quality/cost comparison is still unavailable. Do not treat the deterministic fixture records as a release-quality score. The frozen manifest, baseline adapters, and evaluation harness are verified and ready for external-model runs.

Before release, run every frozen case three times for each baseline against the same business and Contract providers, including the exact Review Group. Record only safe per-case quality scores, hard-rule failures, invocation counts, repair counts, token metrics, and elapsed-time median/range here. Do not store prompts, raw model output, credentials, or provider configuration.
