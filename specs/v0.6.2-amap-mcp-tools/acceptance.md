# Acceptance: v0.6.2 AMap MCP Tools

**Status**: T001–T057 local implementation and verification completed on 2026-09-28. No commit, tag, remote release, or deployment was created.

## A. External contract

- [x] **AC-001** A controlled server-only validation completed `initialize`, `tools/list`, and one low-frequency public contract call for each of the nine approved capabilities. The verified mapping, required and optional fields, GCJ-02 coordinate semantics, safe result kinds, date, and source are recorded in [amap-mcp-tool-boundary.md](./contracts/amap-mcp-tool-boundary.md). The record contains no Key, URL, raw request/response, full address, coordinate, route detail, POI field, or raw error.
- [x] **AC-002** Missing Key and fixed-endpoint error paths leave all map tools unavailable. The only configured endpoint is the fixed AMap host; transport and client tests verify no Key or keyed URL is exposed. Account-console and terms checks remain a user-owned pre-publication operation.

## B. Fixed permissions and security

- [x] **AC-003** The model can receive only the nine static map Tool Definitions on the ordinary General ReAct route. Missing Key yields zero map tools; Skill, Prompt, Tasklist, Delivery, Image, and unknown remote names cannot expand this set.
- [x] **AC-004** 用户和模型均可生成业务参数候选；Provider 前执行 strict schema、GCJ-02 `longitude,latitude`、六位小数、显式非 GCJ 拒绝及 outbound-secret 检查。候选不构成外部事实，也不会授权 IP/browser location、Profile、Memory 或隐式当前位置；缺少用户意图锚点时澄清。
- [x] **AC-005** The Tool Definition/adapter owns the map public projection. Before a map `tool-start`, `tool-end`, or `error(scope=tool)` is written to `StreamEvent`, it excludes Key, keyed MCP URL, raw MCP request/response, full address, coordinates, route details, POI raw fields, and raw AMap errors. Trace titles state the concrete Chinese task purpose and omit provider branding and `amap-*` internal names. The generic `StreamEventProjector` retains its common secret defense; Memory, snapshot, and PostgreSQL use the existing generic Tool policy without a map-only storage branch.
- [x] **AC-006** Each map tool uses the same remote-readonly policy as `web-search` and `read-url`: 20-second attempt timeout and `retrySafe: true`. Tool Runtime alone owns budget, deadline, cancellation and late-result handling. AMap adapter may classify an MCP `isError` only in memory: recognized transient failures receive the existing maximum of two same-argument retries, while an opaque but schema-validated readonly failure has one safe fallback retry. Schema/4xx, permission, known quota exhaustion, empty, and malformed results do not resend the same arguments; later Actions may use repaired arguments. Adapter and MCP client add neither waiting retry nor session recovery.

## C. User stories

- [x] **AC-007 / US1** POI keyword, nearby, and detail tools have contract and runner coverage. POI ID is a schema-validated business candidate from user text or model reasoning; every detail request is re-executed and only its current successful observation may supply final-answer facts.
- [x] **AC-008 / US2** Geocoding and reverse-geocoding have contract and runner coverage for valid, ambiguous, invalid, non-GCJ, and no-implicit-location cases.
- [x] **AC-009 / US3** Walking, driving, bicycling, and transit each have contract and runner coverage. The public result contains only mode, distance, duration, and bounded summary; insufficient cross-city transit data asks for clarification.

## D. Compatibility and presentation

- [x] **AC-010** Existing Tool Trace, `StreamEvent` projection, reconnect/cancel behavior, and local persistence stay on their v0.6.1 protocol path. There is no new map UI, stream chunk, API, database table, or migration.
- [x] **AC-011** The full stable suite covers ordinary no-map behavior, existing tools, route scopes, and public stream compatibility. A failed map request only reports a safe classified failure and never claims a map result or exposes the remote raw error.
- [x] **AC-012** Focused map/runtime tests, application adapter smoke, workspace typecheck, full workspace lint, build, stable regression, and whitespace validation are recorded below and passed in this closing pass.

## E. Closing

- [x] **AC-013** The canonical spec, plan, tasks, contract, ADR, architecture docs, env examples, public version/release/tasklist docs, README, and workspace package manifests are synchronized with the implemented capability. The final `speckit-analyze` and `speckit-converge` reports are recorded below.
- [x] **AC-014** Deployment material documents a server-only Key, missing-Key disablement, and rotation. It also states that account permission, quota/QPS, billing, and terms/data-use checks are performed by the account owner before public rollout; the version adds no account-level limiter, alert, or cost control.
- [x] **AC-015** General ReAct admits at most 21 logical Tool Calls cumulatively per Run. Automated boundary coverage proves that a 22-call batch rejects call 22 before Provider execution, and that the ninth Tool-bearing round with 19 prior admissions only receives two remaining slots. The existing round, concurrency, retry, timeout, deadline and observation limits remain unchanged.

## Evidence

### T050–T053 logical Tool Call budget

- Test-first evidence: under the former `maxLogicalToolCalls=14`, the five focused General ReAct suites reported six expected failures: the state default, input schema, one-batch admission, runtime matrix and final budget-blocked boundary all rejected or capped the new 18-call behavior.
- The implementation changes only `GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls` to 18. The new policy test starts from the eighth Tool-bearing round and 16 prior logical admissions, verifies that the state reducer receives only `+1` round and `+2` calls, and confirms that calls 17 and 18 are admitted while call 19 is rejected. This proves that 18 is a Run total rather than a nine-round multiplier.
- Final verification: focused General ReAct Vitest passed **5 files / 54 tests**; `pnpm --filter @ai-mind/webapp typecheck`, Webapp full lint, and `git diff --check` passed. No live AMap request was made. Manual Spec Kit analysis found the FR-018 / SC-010 requirement, T050–T053, D-022, data model, architecture, and ADR consistent; manual converge found no remaining implementation task.

### T054–T057 21-call cumulative budget

- Test-first evidence: with the former 18-call configuration, the focused General ReAct suite produced seven expected failures. The state default and admission schema rejected 21; a 22-call batch admitted only 18; the ninth-round 19-used case could not reach the remaining two slots; and the Provider preflight boundary still capped at 18.
- The implementation changes only `GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls` from 18 to 21. The 21-call policy keeps the Run-wide cumulative counter, so the ninth Tool-bearing round receives a reducer delta of `+1` round and `+2` calls from a 19-call state; calls 20 and 21 are admitted and call 22 is blocked before Provider execution.
- Final verification: focused General ReAct Vitest passed **5 files / 54 tests**; `pnpm --filter @ai-mind/webapp typecheck` and Webapp full lint passed. Manual Spec Kit analysis found FR-018 / SC-010, T054–T057, D-022, data model, architecture and ADR consistent; manual converge found no remaining implementation task. `git diff --check` passed. This adjustment does not call the live AMap service and does not change map batching, retry behavior, public DTOs, storage, permissions, schemas, or secret handling.

### T001 external mapping gate

- The controlled MCP verification found server version `1.0.0` and the fixed nine-name mapping in [the contract](./contracts/amap-mcp-tool-boundary.md).
- All nine low-frequency public contract calls returned a normal text/JSON result category. No quota or rate-limit condition was deliberately induced.
- The separate application external smoke invokes the nine adapters through the fixed client mapping and passed. It loads the server-only environment only for the test process and emits no sensitive request or response material.

### Automated safety and behavior coverage

- Adapter, transport, registry, fixed binding, map Tool schemas, unified input middleware, General ReAct runner, StreamEvent projector, generic Tool Trace UI, and local persistence are covered by the focused suites.
- The map adapter test fixes the remote names and rejects unknown/schema-incompatible values. Tool and runner tests cover no-Key availability, model-generated candidate parameters, safe schema repair, 4xx non-retry, retryable transport retry, and bounded public traces.
- The StreamEvent and UI tests use sentinels for map-sensitive source material and assert that public Tool traces retain only a safe generic status.

### Release-closing command record

| Check                                    | Result                                                    |
| ---------------------------------------- | --------------------------------------------------------- |
| T025 unified-parameter Vitest suites     | 7 files, 76 tests passed                                  |
| Map boundary / stream / UI Vitest suites | 9 files, 55 tests passed                                  |
| External application adapter smoke       | 1 file, 2 tests passed; all nine fixed adapters exercised |
| `pnpm typecheck`                         | passed                                                    |
| `pnpm lint`                              | passed across all 5 workspace packages                    |
| `pnpm build`                             | passed                                                    |
| `pnpm test:stable`                       | passed                                                    |
| `git diff --check`                       | passed in the final closing pass                          |

## Spec Kit closing record

### `speckit-analyze`

The final read-only analysis compares the current `spec.md`, `plan.md`, and `tasks.md` against the constitution. All 14 functional requirements, seven success criteria, three user stories, and 30 tasks have an implementation or verification trace. It found one medium documentation-status drift (`plan.md` declared closing complete before T030); the drift and an obsolete historical provenance task description were synchronized in the same canonical workspace. No Constitution conflict, uncovered build requirement, duplicate permission path, or task ordering contradiction remains.

### `speckit-converge`

The final convergence review checks the source areas named by the plan and tasks: fixed MCP server/transport/client, static adapter, map Tool Definitions, binding, unified input middleware, public projection, tests, and deployment/docs. It finds 0 missing, partial, contradictory, or unrequested implementation findings; `tasks.md` therefore receives no convergence phase.

## Non-goals verified

- `city-weather` is not replaced; its diagnostics remain research for a later version.
- There is no dynamic MCP discovery, arbitrary server host, user-supplied Key, location inference, direct-map API fallback, local Node MCP server, public map UI, database migration, account-wide rate limit, automatic schema-hash drift detector, detailed route navigation, or map-specific storage policy.

## Post-closing maintenance evidence (2026-09-27)

- Regression first reproduced a city provenance denial (`上海` user input versus `上海市` model argument), generic public Trace names, and missing explicit reasoning request. The later unified-parameter decision supersedes that temporary suffix equivalence: model candidates now pass the same schema/security boundary as user candidates. Purpose-specific public titles, fixed safe error categories, the model-specific `thinking` mapping, and map Tool prompt semantics remain.
- Focused regression after the fixes: 8 map/runtime/model/UI suites, 66 tests passed; model catalog: 1 file, 6 tests passed; Tool prompt: 1 file, 9 tests passed. The historical assertions included non-equivalent city rejection; T025–T029 supersede that source gate while retaining no provider/internal name in public Trace, safe failure classification, and explicit `thinking: enabled` only for the declared model.
- Controlled external verification used the server-only test environment: 1 file, 2 tests passed. It re-ran the nine static adapters and made three concurrent city geocoding calls in one MCP client session. This establishes that the reported triple failure was not reproduced as a service-session concurrency/QPS defect. Test output and records omit Key, URL, raw request/response, full address, coordinates, POI fields, route details, and raw errors.
- No real-model end-to-end request was issued for this diagnostic because that would consume the account's model quota and requires its provider credential. The provider payload mapping and current UI default are covered by unit tests; the account owner can verify the live DeepSeek-compatible route separately.
- Final engineering gates after T023: workspace `pnpm typecheck`, focused changed-file ESLint, `pnpm test:stable`, `pnpm build`, and `git diff --check` passed. The production build exited with code 0 after compiling, typechecking, generating all 14 static pages, and finalizing route optimization.

### Post-closing Spec Kit recheck

- `speckit-analyze`: rechecked the canonical `spec.md`、`plan.md`、`tasks.md` after T024 against the active constitution. All 14 functional requirements, seven success criteria, three user stories, and 24 tasks retain an implementation or verification trace; no terminology, security-boundary, ordering, or coverage finding remains.
- `speckit-converge`: compared the intended fixed map boundary, unified parameter handling, public Trace, model-specific reasoning mapping, prompt semantics, tests, and evidence against the current code. Result: **converged**; no missing, partial, contradictory, or unrequested scope requires an append-only convergence task.

## Prompt scenario refinement evidence (2026-09-27)

- T024 first added two prompt contract tests. They failed because the old Tool use/result prompts did not declare a generic observation-based fact rule, minimal map call selection, or user-scenario guidance.
- The updated prompts now apply one observation-based fact rule to all tools, cover missing/failed results without model supplementation, and use map score, route, missing-location and cross-city-transit scenarios only as tool-selection examples. The targeted prompt suite passes 11 tests after the change.
- This historical prompt-only scope was superseded by T025–T029: tool allowlist and remote mapping remain fixed, while unified parameter handling and retry classification changed as recorded in the current plan and decisions.
- The final typecheck first exposed test-only calls that supplied an argument to the no-argument `getDisplayConfig` implementations. The assertions were corrected without changing production behavior; prompt plus POI/geocode/route suites pass 17 tests, ESLint passes, and workspace `pnpm typecheck` passes.

## Unified business parameter evidence (2026-09-27)

- T025 first made the following regressions fail: a model-generated public `read-url`, model-generated map address/coordinate, a non-retryable 400 response, a missing AMap Key in the generic known-secret set, and generic validation output without repair fields.
- T026 removed `_authorizedUrls` and map provenance state. The Runtime now accepts model and user business candidates through the same fixed allowlist, schema, coordinate, URL and secret boundaries; public map Trace still omits candidate values.
- T027 makes same-argument retry conditional on `normalizedError.retryable`. The scripted runner proves that a schema-rejected map Action consumes a logical call but does not invoke the provider, then a corrected next Action invokes it exactly once. Middleware tests prove the AMap Key is rejected before a non-map remote-readonly provider call.
- T028 prompt contracts state that candidates can be model-generated, Tool observation is the only external fact basis, missing location anchors require clarification, and safe repair requires a changed parameter set.
- Focused command: `pnpm --filter @ai-mind/webapp exec vitest run ...` covering seven suites completed with **76 passed**. Full workspace typecheck, lint, Spec Kit analysis/convergence and controlled external smoke are recorded by T030 after this synchronization.

### T030 final verification (2026-09-27)

- `pnpm typecheck` passed across the workspace.
- `pnpm lint` passed across all five workspace packages.
- The T025 focused runtime suites passed: 7 files / 76 tests. The map adapter, client, transport, binding, projector, schema and Trace UI suites passed: 9 files / 55 tests.
- The controlled server-only external smoke passed: 2 tests, covering the nine fixed adapter capabilities and a three-call geocoding batch in one MCP client session. Records omit Key, URL, raw payloads, sensitive location fields and raw remote errors.
- `pnpm test:stable`, `pnpm build`, and final `git diff --check` all passed.
- Manual `speckit-analyze` found only the corrected documentation-status drift; manual `speckit-converge` found no implementation gaps and appended no tasks.

### T045–T047 `isError` transient retry classification (2026-09-28)

- Test-first verification added adapter and Runtime regressions. Before the implementation, the opaque MCP failure stopped after one attempt and a protocol `isError` carrying `TOO_MANY_REQUESTS` lost its safe `429` and retry hint; the targeted Vitest run failed in exactly those two assertions.
- The adapter now parses `isError` content only in memory, immediately reduces it to stable code/status/retry metadata, and rethrows a fixed Chinese message without raw error text or cause. Recognized rate-limit, service, timeout and connection signals use the existing Runtime exponential retry; unclassified readonly failures carry `retryLimit=1`; recognized Key, permission, quota and invalid-parameter signals do not retry.
- This is a tightly coupled `MCPHostError` → adapter → Tool Runtime change, so it was integrated by one owner; no safely isolated implementation package remained for parallel delegation.
- Focused verification: `pnpm --filter @ai-mind/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/mcp/adapters/amap-mcp-tool-adapter.test.ts tests/lib/ai/runtime/tool-runtime-execution.test.ts` passed **2 files / 28 tests**. `pnpm --filter @ai-mind/webapp typecheck` and `pnpm --filter @ai-mind/webapp lint` passed. No real AMap request was sent for this change.
- Manual Spec Kit analyze and converge rechecked FR-015 / SC-008, plan decision 9, the adapter/error/Runtime boundary and T045–T047. They found no constitution conflict, uncovered implementation work, or new convergence task. `git diff --check` passed after the final synchronization.

### T048–T049 audit remediation: quota exhaustion must override 429 retry (2026-09-28)

- Audit added a combined protocol regression for `DAILY_QUERY_OVER_LIMIT` with safe `status=429`. It first failed: the adapter treated the response as a short-term rate limit, and the Runtime performed three same-argument attempts.
- The adapter now classifies known quota, Key, permission and invalid-parameter signals before generic HTTP status. It carries only safe scalar status and `retryable=false`; Runtime treats an explicit non-retryable `MCPHostError` as final before its general 429/5xx classification. No raw error, response text, Key or URL leaves the adapter.
- Targeted verification after the change: `pnpm --filter @ai-mind/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/mcp/adapters/amap-mcp-tool-adapter.test.ts tests/lib/ai/runtime/tool-runtime-execution.test.ts` passed **2 files / 29 tests**. The change does not call the live AMap service.
- Closing typecheck also exposed a JSX literal mismatch in the already modified empty-state capability icon (`aria-hidden="true"` where the icon contract requires a boolean). The literal was corrected to `aria-hidden={true}`; its component suite passed **1 file / 4 tests**, webapp typecheck and lint passed, and final `git diff --check` passed.

### T031–T035 completed constrained-finalizer maintenance (2026-09-27)

- The regression was reproduced first: a `completed` Run with `finalizationMode='constrained'` rendered the failed-state heading “处理未完成”, although the runner had already ended the Trace as `completed` and returned a usable final answer.
- The Trace title now follows the terminal `AgentRun.status`: `completed` renders “已完成思考”, `failed` renders “处理未完成”, and `cancelled` renders “已停止思考”. `constrained` continues to control its existing expansion and Memory-eligibility semantics only.
- The constrained finalizer now receives the same active Tool result facts rule as the Action loop. For map routes without a returned distance or duration, the final answer must state that the route is unconfirmed and may not infer a value from coordinates, straight-line distance, prior experience, or a similar route.
- Test-first evidence: before the production change, the two constrained-heading assertions and the finalizer map-result-policy assertion failed; after the change, the focused Trace, chat-session and prompt suites passed with 3 files / 33 tests. A second red test showed that a `completed` Run with no rendered final-text marker still displayed “正在思考”; the title now immediately follows the terminal state.
- Final validation: the extended Trace, message presentation, chat-session, prompt and General ReAct runner suite passed with 5 files / 51 tests; `pnpm typecheck`, `pnpm --filter @ai-mind/webapp lint`, and `git diff --check` passed.

### T035 Spec Kit closing recheck

- Re-read `.specify/feature.json` and confirmed that this maintenance remains in the sole canonical `specs/v0.6.2-amap-mcp-tools` workspace. `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` reported the expected feature directory and implementation documents; no optional extension was configured.
- Manual `speckit-analyze` equivalent checked FR-008, FR-014 and SC-007 against the plan, tasks, D-018, the public Trace component, `chat-session`, and Tool prompts. The completed/failed distinction, constrained Memory ineligibility, active Tool result rule and route no-inference rule agree; no spec, architecture, security, or test-coverage contradiction remains.
- Manual `speckit-converge` equivalent checked the current source and documentation against the completed T031–T035 scope. It found no missing, partial, contradictory, or unrequested work, so no convergence task was appended.

### T036–T039 safe failure and no-result repair (2026-09-27; `isError` retry scope superseded by T045–T047)

- Tests first reproduced six regressions: raw-safe HTTP status was discarded before Runtime classification, typed MCP timeout/connection became non-retryable, reverse-geocode dropped administrative fields, an explicit empty POI array looked like an ordinary result, the public output did not state “未找到地点”, and the result prompt allowed avoidable repeat queries.
- At that point, `MCPHostError` kept only stable code plus safe scalar `status`/`retryAfterMs`; the AMap client and adapter rebuilt fixed Chinese errors without a raw cause. T045–T047 extend this historical policy with in-memory `isError` classification and a one-attempt opaque fallback; raw error content still never leaves the adapter.
- Reverse geocode allowlists only country, province, city and district. A concrete `pois: []` yields `resultStatus='no-result'` and public “未找到地点”; absent or malformed POI shapes remain safe failures. The result prompt forbids repeating the same Tool with normalized identical arguments after no-result.
- Targeted Vitest: 5 files / 46 tests passed. Workspace `pnpm typecheck`, `pnpm --filter @ai-mind/webapp lint`, full `pnpm test:stable`, and the controlled server-only external smoke (9 fixed capabilities plus a three-call geocoding batch, 2 tests) passed. Output records contain no Key, URL, raw request/response, location field, or raw remote error.

### T039 Spec Kit recheck

- `.specify/feature.json` and `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` both resolve the sole canonical v0.6.2 workspace; no extension hooks are configured.
- Manual `speckit-analyze` equivalent compared the 16 functional requirements, eight success criteria, three user stories, nine plan decisions and T001–T039. It found no constitutional conflict, uncovered requirement, contradictory retry/no-result rule, terminology drift or unchecked implementation task.
- Manual `speckit-converge` equivalent traced FR-015/FR-016 and SC-008 to the client, adapter, Tool Runtime, public formatter, prompt, focused regressions, external smoke and public documents. It found no remaining missing, partial, contradictory or unrequested scope, so no convergence task was appended.

### T058–T060 constrained-finalizer unbounded output (2026-10-08)

- Test-first regression evidence: under the old behavior, the finalizer received a finite remaining timeout, `timeoutMs: null` still fell back to the configured Provider timeout, Chat Service aborted resumable execution at the legacy 270-second boundary, and durable projection inherited that deadline. The new assertions failed before the implementation change.
- The implemented boundary is `preFinalizationDeadlineMs=240_000`: the existing 235-second loop and 5-second handoff reserve still protect Tool/action work. A constrained finalizer now receives `timeoutMs: null`, has no Runtime timer, and keeps the explicit parent cancellation signal. Chat Service does not create a global deadline abort or pass the pre-finalization time to `DurableStreamProjectionBuffer`; normal no-Tool final text remains a loop result.
- Focused verification passed: `pnpm --dir apps/webapp exec vitest run tests/lib/ai/runtime/general-react-agent/agent-state.test.ts tests/lib/ai/runtime/general-react-agent/runtime-policy-matrix.test.ts tests/lib/ai/runtime/general-react-agent/general-react-agent-runner.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/model-provider/openai-compatible-provider.test.ts tests/lib/ai/chat-service.test.ts` — **6 files / 80 tests**. The suite covers a finalizer that completes after the old 270-second boundary, a finalizer that enters during the 235-second handoff and completes after the 240-second pre-finalization boundary, explicit cancellation, Provider timeout bypass, resumable execution, and projection behavior.
- `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`, and `git diff --check` passed. Manual Spec Kit analyze found no CRITICAL/HIGH inconsistency between FR-019, SC-011, plan item 11, D-023, and T058–T060; manual converge found no remaining implementation gap and appended no task. No live AMap or model-provider request was made, and no stream DTO, database schema, or Provider routing changed.

## Release rule

The nine-tool contract, app smoke, and automated gates are all required for a map-capability release. Public rollout is still blocked on the account owner’s independent console and terms/data-use review. This local engineering closing does not create a Git commit, tag, remote release, deployment, or a claim of public service authorization.

## Phase 10 initial evidence: AMap request batch pacing (2026-09-28)

- Controlled server-only diagnosis reproduced safe `REQUEST_FAILED` after non-batched detail request bursts, while 3 concurrent real details succeeded. The exact batch strategy selected by the user was then verified twice: three batches of three real POI details with a 1000ms cooldown and with a 500ms cooldown each completed 9/9. Records intentionally contain only success counts and safe error codes.
- T040–T044 initially required a deterministic manager-level red/green regression, cancellation/close coverage, env-gated 3×3 external smoke, and the normal engineering gates. The implemented scheduler is process-local by `serverId`; it is not a cross-instance account quota system.

## T040–T044 AMap request batch pacing (2026-09-28)

- T040 first reproduced the defect: seven same-tick `amap-maps` calls were forwarded immediately by the old Manager. The red test expected only three starts and failed with seven. The green deterministic suite then covered 3-item batch boundaries, cooldown, unconfigured-server pass-through, server isolation, same-batch failure, queued cancellation, `close`, `closeAll`, and original failure propagation; 7 tests passed while the configured cooldown was 500ms.
- T041 adds a server-owned `toolCallBatchPolicy`; only `amap-maps` declares it. T042 keeps the queue in `MCPClientManager`, shares it by `serverId`, waits for every item in a batch to settle before its next cooldown, removes queued aborted items, and rejects queued items during close. It does not add retries, error wrapping, raw diagnostics, adapter changes, public events, persistence, or a `serverId` special case.
- T043 adds an env-gated external smoke that dispatches nine real detail calls through the shared adapter. At the verified 500ms configuration the external file completed 3 tests, including the 3×3 detail sequence; focused Manager/client/adapter/Runtime regression completed 4 files / 39 tests. These records omit the Key, URL, POI ID, address, coordinates, payload, and raw remote error.
- After those results, the user selected `cooldownMs=800`. It is a longer, more conservative interval than the verified 500ms. The implementation, deterministic assertion, canonical spec and public documentation were updated without rerunning tests, exactly as requested. Workspace typecheck and targeted lint had passed before the constant-only adjustment. The already-started full `pnpm test:stable` run ended with one unrelated calculator latency threshold failure (`calculator-tool.test.ts` p95 above its 5ms limit); it did not report a batch-scheduler failure, and it was not rerun after the user’s instruction. The post-update `git diff --check` passed.

### T044 Spec Kit closing recheck

- `.specify/feature.json` and `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` resolve the only canonical v0.6.2 workspace; no extension hooks are configured.
- Manual `speckit-analyze` checked FR-017 and SC-009 against the 800ms plan, server-owned policy, Manager queue, deterministic coverage, external smoke, privacy boundaries, and release docs. It found no contradiction, unmapped requirement, or constitutional conflict; the skipped post-800ms test execution is explicit user direction, not a hidden pass claim.
- Manual `speckit-converge` checked the current source and documents against the completed T040–T044 scope. The optional policy is declared only by `amap-maps`; the Manager owns scheduling, cancellation and close behavior; no adapter, Runtime, StreamEvent, storage, retry or cross-instance behavior was added. No remaining implementation task was appended.
