# Quickstart: Image Generation Agent

**Feature**: v0.4.12 Image Generation Agent  
**Purpose**: implementation and acceptance guide; not a user-facing tutorial

## 1. Prerequisites

- Node.js `>=22 <23`
- pnpm 10.34.0
- PostgreSQL running with current AI Mind migrations
- existing server-side Doubao Key `AI_MIND_DOUBAO_API_KEY` (reuse; do not add an image-specific Key)
- target account authorized for the Agent Plan image endpoint

Fixed integration, defined in the server-only image provider config module:

```text
model: doubao-seedream-5.0-lite
endpoint: https://ark.cn-beijing.volces.com/api/plan/v3/images/generations
```

Do not move these values to env, add client configuration, or expose model selection for them.

## 2. Contract-first Implementation Order

1. Add strict command/request schemas for `/image`.
2. Add the official shadcn `AspectRatio` primitive to `apps/webapp/components/ui/`; reuse existing Card/Badge/Button/Alert/Skeleton.
3. Run the credentialed T003 Agent Plan contract-discovery smoke and write only safe confirmed facts to the provider/content contracts.
4. Add `image-brief` and `image-result-ready` to `stream-core`, schema tests and webapp schema.
5. Add ImageBrief, PromptInspection and provider response schemas.
6. Add `ImageGenerationRun` migration/repository, active-session lease and bounded expired-result cleanup integration tests.
7. Implement fixed Seedream provider with fake HTTP contract tests based on the T003 facts.
8. Implement bounded LangGraph and graph tests.
9. Integrate `/api/chat`, StreamRun, cancellation and same-origin content route.
10. Implement reducer, accessible read-only brief card, Blob image card and download.
11. Run regressions and repeat the Agent Plan smoke as a contract-drift check.
12. Update ADR, architecture, version/release and README artifacts.

## 3. Local Configuration

Reuse the project's existing server secret; do not add an image-specific Key:

```dotenv
AI_MIND_DOUBAO_API_KEY=<secret>
```

No image-specific endpoint/model env is required in v0.4.12 because both values are fixed. Never commit a real Key.

## 4. Required Automated Verification

Run the smallest relevant tests during each layer, then the repository gates:

```text
stream-core protocol/schema tests
image provider contract tests
image graph node/edge/runner tests
ImageGenerationRun repository/integration tests
/api/chat and temporary image route tests
stream projector/replay/reducer tests
ImageBrief and ImageResult UI tests
ordinary chat / Tasklist / Delivery regression tests
pnpm typecheck
pnpm lint
pnpm build
```

## 5. Graph Acceptance Matrix

| Case                                                        |      Prompt revisions | Image calls | Terminal                                                    |
| ----------------------------------------------------------- | --------------------: | ----------: | ----------------------------------------------------------- |
| Initial prompt passes                                       |                     0 |           1 | completed                                                   |
| Initial prompt has fixable issue, revision passes           |                     1 |           1 | completed                                                   |
| Revision leaves non-blocking issue                          |                     1 |           1 | completed                                                   |
| Initial/revised prompt has unresolved blocking issue        |                0 or 1 |           0 | failed                                                      |
| Unsupported edit/reference/multi-image request              |                     0 |           0 | failed                                                      |
| ImageBrief/inspection/revision structured output is invalid | current call consumed |           0 | failed with `IMAGE_PROMPT_PLANNING_FAILED`; no repair/retry |
| User cancels before provider call                           |                0 or 1 |           0 | cancelled                                                   |
| User cancels during provider call                           |                0 or 1 |   at most 1 | cancelled; late result discarded                            |
| Provider response is ambiguous                              |                0 or 1 |           1 | failed; no retry                                            |

Every graph test must also assert:

```text
planningModelCalls <= 5
revisionCount <= 1
generationCount <= 1
```

Expected planning calls are approximately 3 on the direct path and at most 5
when one prompt revision and reinspection are required.

Every structured planning response gets one strict parse only. Invalid output
consumes the current call and terminates safely; there is no hidden model-based
JSON/schema repair call.

Every planning node checks the global counter before invocation. If the counter
is already 5 and the graph still requires another planning call, it terminates
with `IMAGE_PROMPT_PLANNING_FAILED` before invoking the model.

## 6. Concurrency and Idempotency Acceptance

### Same session, three concurrent requests

Expected:

- one `ImageGenerationRun` owns the active lease
- at most one external image call
- two requests return `409 IMAGE_GENERATION_ALREADY_ACTIVE`

### Same idempotency key

Expected:

- replay returns the original `StreamRun`
- no active-conflict response
- no second external image call

### After terminal

After completed/failed/cancelled:

- active lease is null
- a new `/image` request for the same session is accepted

### Stale lease

After simulated executor crash and lease expiry:

- cleanup releases the stale lease safely
- cleanup does not resume or repeat generation

### Daily image quota

Use an isolated in-memory rate-limit store with the default configuration:

```text
imageDailyLimitPerSession = 3
imageDailyLimitPerIp = 10
```

Verify that:

- the first three accepted `/image` tasks for one Session are allowed and the fourth returns 429 with the daily image quota message;
- ordinary chat requests do not consume the image quota;
- a second Session on the same IP contributes to the shared IP bucket and the eleventh accepted image task is rejected by default;
- overriding the IP limit to 20 allows the twentieth task and rejects the twenty-first;
- invalid/unsupported requests, idempotent replay and active-session conflicts do not increment the image bucket;
- planning failure, cancellation or Provider failure after task acceptance still consumes one image quota unit;
- image quota counters use the server natural-day key and are not exposed in public DTOs.

## 7. Temporary Content Security Acceptance

Use fake upstream responses to verify:

- owner session succeeds; another session gets 403
- content route receives no client-provided provider URL
- HTTP, IP literal, unknown host, custom port, userinfo and redirects are rejected
- oversized declared and actual bodies are rejected
- MIME and magic bytes must agree
- empty/truncated body is rejected
- success includes `private, no-store` and `nosniff`
- StreamEvent/public DTO never contains provider URL, Prompt, Base64, Key or raw error
- every ready result expires at the earlier of reliable provider expiry and 10 minutes after ready; a result at/past expiry is rejected before URL use
- bounded repository cleanup atomically changes eligible `ready` rows to `expired` and nulls their provider URL

## 8. Browser Acceptance

### Success

1. Select `/image`.
2. Enter a legal description.
3. Submit.
4. Verify read-only ImageBrief summary.
5. Verify safe progress: brief → prompt → generation → result.
6. Verify exactly one image appears.
7. Verify the image card says it is temporary.
8. Download the image.
9. Verify preview Blob and downloaded file have identical bytes/hash.
10. Verify the browser requested the same-origin content endpoint once.

### Explicit entry

- “帮我画一张图片” without `/image` remains ordinary chat.
- `/image` with empty text is rejected before run creation.

### Unsupported capability

Requests for edit, inpainting, outpainting, remove-background, reference image, multi-candidate or group image show a capability boundary and perform zero image calls.

### Cancellation

1. Start a fake delayed provider.
2. Click stop.
3. UI becomes cancelled within one second.
4. Let provider return late.
5. Verify no ready event, no preview/download and no completed override.

### Blob cleanup

- component unmount/result replace/cancel aborts pending content fetch
- `URL.revokeObjectURL` is called
- refresh/local snapshot does not restore stale object URLs

### Accessibility

- image alt text is derived only from the public ImageBrief summary
- download is keyboard reachable and has an explicit accessible name
- stop is keyboard reachable and has an explicit accessible name
- loading/completion uses polite status semantics and errors use `Alert`
- expired-result recovery guidance is exposed within the semantic error alert
- status changes do not force focus away from the user's current control

## 9. Latency Acceptance

- End-to-end timing starts when the server accepts a valid `/image` request.
- It ends when `ImageResultPart` has fetched the same-origin content, created the Blob URL, and the image fires a successful `load`.
- The measurement therefore includes ImageBrief/prompt planning, Seedream generation, temporary-content proxy download and browser decode.
- Deterministic tests verify the timing boundaries and that a request beyond 120 seconds remains visibly processing or becomes an explicit failure.
- Service logs record safe per-stage durations and server total from StreamRun creation to `image-result-ready`/terminal.
- A single real smoke records only one sample and cannot establish the 95th-percentile SLO.

## 10. Real Agent Plan Smoke

This smoke uses the fixed model and endpoint; it must not test alternate URLs/models.

Run it at two points:

1. T003, before T028/T036, discovers and locks the external contract.
2. T055, after implementation, checks the same facts for drift and records one safe duration sample.

Capture only safe facts:

1. request fields accepted by `doubao-seedream-5.0-lite`
2. working default `size`
3. single-result response schema
4. provider request ID location
5. temporary image host and redirect behavior
6. actual MIME, byte size and dimensions
7. content safety error shape
8. local abort behavior

Do not print or retain:

- API Key
- internal Prompt
- full signed provider URL
- raw moderation response

Update `contracts/seedream-provider-contract.md` and `contracts/temporary-image-content-contract.md` with the confirmed field/threshold values.

## 11. Acceptance Evidence Matrix

| Success criteria          | Required evidence source                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-052-001, 002, 004, 010 | deterministic route/orchestrator regression tests with fake provider                                                                              |
| SC-052-003, 011, 012      | deterministic GraphState/node/stream schema tests with fake planning model                                                                        |
| SC-052-005, 007, 009, 013 | deterministic reducer/component/content-route tests with fake upstream bytes and fake timers                                                      |
| SC-052-006                | deterministic timing-boundary/UI-timeout tests plus recorded safe sample from T055; no single smoke claims p95                                    |
| SC-052-008, 014           | PostgreSQL integration and route ownership/concurrency tests                                                                                      |
| SC-052-015                | deterministic provider-error normalization and public stream projection tests; T003/T055 only verify real contract shape when safely reproducible |

All 100% statements are acceptance expectations for their named deterministic test sets, not claims about uncontrolled production traffic.

## 12. Migration and Crash Reconciliation

- The v0.4.12 migration is additive and forward compatible with the previous application version. Do not perform a destructive schema rollback after it is applied.
- If deployment stops after migration but before the new code accepts image work, no image run exists. If interruption happens after an active run is created, `activeLeaseExpiresAt` bounds the stale lease.
- On the next image acquisition/reconciliation path, the repository verifies that no healthy executor owns the run, clears only the stale lease, and marks the affected run with a safe terminal/recovery result. It never resumes the graph, reuses a provider URL or repeats image generation.
- Rollback to prior application code is permitted only because the migration is additive; the new tables/columns remain until a future explicit data migration. T043/T047 provide the automated proof of this behavior.

## 13. Release Closing

- run Spec Kit `tasks`, `analyze` and `converge`
- create/update `docs/adr/0016-controlled-image-generation-agent.md`
- create `docs/architecture/image-generation-agent.md`
- sync stream/recovery architecture docs
- sync README, version/release/tasklist public docs
- update package version to `0.4.12` only at formal release closing
- confirm production Compose has no image volume or object storage dependency
- confirm environment templates document only the required server secret

## 14. Formal Acceptance and Decisions

- `acceptance.md` is the executable acceptance matrix and browser evidence record for
  SC-052-001 through SC-052-015.
- `decisions.md` records the fixed model/provider, bounded LangGraph policy, no-HITL
  boundary, temporary content delivery and lease/cancellation decisions.
