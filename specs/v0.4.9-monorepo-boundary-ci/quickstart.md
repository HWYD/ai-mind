# Quickstart: v0.4.9 Monorepo Governance Verification

Run these commands after the v0.4.9 implementation. Use Node.js 22 and pnpm 10.34.0; do not provide production secrets.

## 1. Install and inspect boundaries

```powershell
pnpm install --frozen-lockfile
pnpm validate:workspace-boundaries
pnpm test:governance:boundaries
pnpm validate:test-lanes
pnpm test:governance
```

Expected: the boundary validator reports the discovered scoped workspaces and every fixture regression passes. An undeclared internal dependency, duplicate identity, forbidden direction, cycle, unmanaged manifest, direct cross-workspace implementation import, or private deep import must fail with the source workspace/file and reason. The lane validator must emit one classification for every automated test, including workspace, file, and exactly one lane; a test-like file outside its workspace's managed test root must fail instead of being ignored.

Check a bad filter explicitly:

```powershell
pnpm --filter @ai-mind/not-a-workspace test:stable
```

Expected: non-zero exit because `failIfNoMatch` is enabled.

## 2. Run normal local validation

```powershell
pnpm lint
pnpm typecheck
pnpm test:stable
pnpm build
pnpm test:integration
pnpm test
```

`test:stable` must first run `validate:test-lanes` and the root governance regression suite, then complete without `DATABASE_URL`; workspace tasks may use Turbo cache on a repeat run. `test:integration` requires a disposable local PostgreSQL instance and the same explicit Prisma/migration/checkpoint setup sequence used by CI. Without `DATABASE_URL`, it must fail as an integration configuration error before Turbo/Vitest instead of returning a successful all-skipped result. The root `test` command is stable first, then integration.

For local positive integration verification, initialize the disposable Docker PostgreSQL explicitly before running the integration or aggregate command:

```powershell
pnpm dev:db:setup
$env:DATABASE_URL = 'postgresql://ai_mind:ai_mind@127.0.0.1:5433/ai_mind'
$env:AI_MIND_AGENT_RUN_SESSION_SECRET = 'local-release-verification-session-secret'
$env:AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS = '1024'
pnpm test:integration
```

The root `build` and every root test entry must run `validate:workspace-boundaries` before Turbo can restore a cached task result.

Inspect the task contracts when debugging cache behavior:

```powershell
pnpm exec turbo run test:stable --dry=json
pnpm exec turbo run test:integration --dry=json
pnpm exec turbo run test:external --dry=json
```

Expected: stable tasks are cacheable; integration and external tasks are `cache: false`.

## 3. Run a workspace diagnostic command

```powershell
pnpm --filter @ai-mind/webapp test:stable
pnpm --filter @ai-mind/database test:integration
pnpm --filter @ai-mind/stream-core test:stable
pnpm --filter @ai-mind/project-assistant-service test:stable
```

These are diagnostics for a single workspace; they do not replace the root canonical flow.

## 4. Verify local development task ownership

```powershell
pnpm exec turbo run build:watch:transpile build:watch:types --filter=@ai-mind/stream-core --dry
```

Expected: only the two `@ai-mind/stream-core` watch tasks are selected; both are persistent and uncached. `npm-run-all2` is not a root or workspace dependency, and the database has no `build:watch` script because Prisma generation is finite local setup work. `pnpm dev:db` only starts and health-checks PostgreSQL; use `pnpm dev:db:setup` explicitly for Prisma generation and the existing `db:setup:deploy` migration/checkpoint sequence.

## 5. Run external smoke only deliberately

```powershell
$env:AI_MIND_RUN_EXTERNAL_TESTS = '1'
pnpm test:external
```

Use only a dedicated non-production credential environment and satisfy the documented cloud/live smoke prerequisites. Ordinary root/CI flows report this lane as **not run**. Without the explicit opt-in or required credentials, `test:external` must fail before calling a service as an **external validation configuration failure**; after opt-in, quota/network/provider failures are **external validation failures**. It is never part of `pnpm test`, PR CI, or scheduled CI.

## 6. Review CI ordering

Confirm `.github/workflows/ci.yml` has:

1. a `stable-validation` job with no PostgreSQL service, `DATABASE_URL`, migration, or checkpoint setup;
2. a `stateful-integration` job with `needs: stable-validation`, which alone starts PostgreSQL and initializes state;
3. the Docker build-check job independent from the test lanes.

For the decisive negative-path check, introduce a temporary local-only stable validation failure in a workflow review or test branch: GitHub Actions must mark `stateful-integration` as skipped because `needs: stable-validation` failed, and no PostgreSQL service, migration, or checkpoint setup log may exist. Remove the temporary failure before committing.
