# Decisions 045: Long-term User Memory Store Baseline

**Status**: Implemented and verified  
**Version**: v0.4.5  
**Date**: 2026-07-06

## D045-001: Use UserMemory as the feature name and domain boundary

**Decision**

- v0.4.5 uses `UserMemory` / 长期用户记忆 as the primary naming.
- `ProjectMemory` is not used as the main name.

**Rationale**

- The real user-facing value is remembering long-term user preferences, stable instructions, workflow preferences, and stable collaboration context.
- Project-specific context can be one `UserMemoryType`, but the feature is broader than project rules.

## D045-002: UserMemory is browser-session scoped, not account-level memory

**Decision**

- UserMemory scope is the current browser session.
- Conversations in the same browser session can share validated UserMemory.
- v0.4.5 does not provide account-level, cross-device, or global user profile memory.

**Rationale**

- v0.4.4 already established browser-session scoped multi-conversation short-term memory.
- This keeps the next step small and avoids account profile, cross-device sync, consent, and lifecycle complexity.

## D045-003: LangGraph Store and PostgresStore are mandatory baseline technologies

**Decision**

- UserMemory Store MUST use the LangGraph Store abstraction.
- PostgresStore MUST be supported as the durable production-oriented provider.
- InMemoryStore MAY exist only as local development and test fallback.

**Rationale**

- Long-term memory needs a Store abstraction rather than being folded into ThreadState checkpoint storage.
- PostgresStore gives a durable validation path without introducing Prisma-managed ChatMessage history.
- InMemoryStore keeps local tests fast while preserving the production requirement.

## D045-004: UserMemory Store is separate from ThreadState, checkpoints, registry, and business history

**Decision**

- UserMemory Store is separate from conversation-scoped ThreadState checkpoint storage.
- It is separate from Conversation Registry.
- It is not ChatMessage business history and does not add ChatSession / ChatMessage tables.
- UserMemory is not written into ThreadState messages, summary, pinnedDecisions, hydration payload, stream-core chunks, frontend reducer public state, GraphState, or RuntimeArtifact.

**Rationale**

- ThreadState remains the selected conversation short-term context source of truth.
- UserMemory is cross-conversation supplemental context, not a transcript store.
- This protects v0.4.3/v0.4.4 memory compatibility and stream/frontend public contracts.

## D045-005: Use an independent PostgresStore schema and setup script

**Decision**

- Durable UserMemory uses an independent schema named `langgraph_user_memory`.
- Setup is done by `apps/webapp/scripts/setup-user-memory-store.mjs`.
- Webapp command: `pnpm --dir apps/webapp db:user-memory:setup`.
- Root command: `pnpm db:user-memory:setup`.
- Prisma migrations do not manage LangGraph Store tables.

**Rationale**

- UserMemory Store is a LangGraph runtime Store, not a Prisma business table.
- Separate setup keeps checkpoint setup, chat-memory setup, business migrations, and UserMemory setup independently understandable and recoverable.

## D045-006: Runtime config selects memory or postgres mode with safe defaults

**Decision**

- `AI_MIND_USER_MEMORY_STORE=memory|postgres` controls provider mode.
- development/test default to `memory`.
- production defaults to `postgres`.
- Invalid values use deterministic safe handling and must not expose raw provider details to users.

**Rationale**

- Local development should not require Postgres for every focused test.
- Production must have a durable provider when UserMemory is enabled.
- Safe fallback/error handling prevents Store config from breaking ordinary chat.

## D045-007: UserMemory write runs as an asynchronous background pipeline

**Decision**

- UserMemory write is handled by an internal background pipeline after an eligible completed turn.
- The main assistant does not receive a direct memory-write tool in v0.4.5.
- The pipeline enqueues one in-process best-effort extraction job for every eligible completed ordinary turn, only after assistant final turn completion and persisted conversation identity is available.
- v0.4.5 does not add a durable job queue, worker system, or retry scheduler for UserMemory extraction.
- UserMemory extraction, validation, and Store write failures do not roll back or fail the completed user-facing answer.

**Rationale**

- Background write keeps memory extraction off the chat hot path and avoids adding latency to streaming.
- Keeping memory write out of the main assistant tool list protects Tool, MCP, Tasklist, and Delivery authority boundaries.
- Waiting until final turn completion prevents partial, failed, cancelled, or rejected turns from writing long-term memory.
- Long-term memory is supplemental and must not become a single point of failure.

## D045-008: PinnedDecision promotion is supported conservatively after compaction

**Decision**

- PinnedDecision promotion is SHOULD, not the MVP's only write path.
- Promotion runs only after successful compaction.
- It evaluates only newly added or changed pinnedDecisions.
- It does not scan full conversation transcripts, write summary directly, or write all pinnedDecisions by default.

**Rationale**

- Pinned decisions may represent stable preferences or constraints, but they are still short-term conversation artifacts.
- Diff-only promotion avoids turning compaction into broad long-term memory extraction.
- Reusing the validation/write path keeps safety consistent with explicit intent.

## D045-009: Model extracts structured candidates, deterministic rules decide persistence

**Decision**

- Model output identifies memory value, type, clean text, tags, confidence, action, conflict/update hints, and reason through structured candidate extraction.
- Program rules decide validation, rejection, stable key, dedupe, conflict handling, and Store write.

**Rationale**

- Candidate extraction benefits from semantic interpretation.
- Persistence must be deterministic, auditable, and bounded because long-term memory affects future conversations.

## D045-010: Stable key and dedupe are deterministic and identity-based

**Decision**

- Stable key is generated or normalized by program rules.
- Stable key is generated from structured candidate identity.
- Model suggestions may inform text/tags/identity but are not trusted as the only identity rule.
- Equivalent active memory updates or rejects by stable key instead of creating duplicates.

**Rationale**

- Stable deterministic identity is required for dedupe, update, and suppression.
- Raw source text hashes alone would fragment equivalent preferences and make conflict handling unreliable.
- 把 stable key 的主题、极性和补充限定拆成 structured identity，更可控，也更接近主流 extract-then-normalize memory 做法。

## D045-011: Sensitive, raw, low-confidence, duplicate, and oversized content is rejected by default

**Decision**

- All candidates must pass deterministic validation.
- v0.4.5 rejects sensitive personal information by default.
- It also rejects low confidence, unsupported types, full transcripts, raw tool/runtime/provider data, API keys, cookies, provider config, duplicates, irrelevant placeholder text, and oversized text.
- Structured extraction must output an explicit `stability` field: `stable | temporary | speculative`.
- `temporary` and `speculative` candidates are rejected by deterministic validation based on that structured field.
- v0.4.5 does not rely on narrow deterministic keyword deny-lists to infer these semantic categories.

**Rationale**

- Long-term memory is reused across conversations, so unsafe persistence has lasting impact.
- This version is a baseline, not a memory management product with full user inspection and correction tools.
- 长期记忆该不该保存，应由模型结构化表达 `stability`，再由程序按明确字段做拒绝，而不是让代码继续用脆弱关键词去猜语义。
- 关键词级 temporary/speculative regex 既不属于安全边界，也很难覆盖真实语言表达，继续作为硬拒绝会制造误判和错误确定性。

## D045-012: Natural-language forget/update uses persistent suppression, not physical delete

**Decision**

- Explicit negation, conflict, update, or natural-language forget marks matching memory as `inactive` or `suppressed`.
- Suppressed memory does not participate in retrieval.
- v0.4.5 does not physically delete memory through this natural-language flow.
- Full Memory Inspector, edit UI, delete UI, and management backend are out of scope.

**Rationale**

- Users can change preferences, and the system must stop reinforcing contradicted memory.
- Suppression provides safe behavior without building a complete memory management product in this version.

## D045-013: Retrieval applies to ordinary text chat and tool-assisted ordinary chat only

**Decision**

- UserMemory retrieval is enabled for ordinary text chat.
- UserMemory retrieval is also enabled for tool-assisted ordinary chat when it shares the same ordinary chat context boundary.
- Tasklist and Delivery do not use UserMemory retrieval in v0.4.5.

**Rationale**

- Ordinary chat is the intended context where user preferences and instructions improve answer quality.
- Tool-assisted ordinary chat still produces ordinary chat planning/final-answer context and can benefit from preferences.
- Tasklist and Delivery have separate authority, GraphState/checkpoint/run-local semantics, and should not inherit long-term memory retrieval yet.

## D045-014: Retrieval is bounded, relevant, and rule-based in MVP

**Decision**

- Retrieval uses current browser session namespace only.
- MVP retrieval is rule-based, not embedding or pgvector based.
- It filters by active status, confidence `>= 0.7`, structured type/tags/normalized text overlap, and bounds.
- At most 3 memories are injected.
- Each memory text is at most 300 Chinese characters.
- Total injected UserMemory text is at most 900 Chinese characters.
- No relevant memory means zero injection.

**Rationale**

- 结构化 tags overlap 比代码内二级领域词表更通用，也更贴近 “模型理解、规则保命” 的设计边界。
- retrieval 仍然保持 deterministic，可测试且可控，不需要在 v0.4.5 引入 embedding 或额外 rerank 模型。
- Bounded rule retrieval is enough for the baseline and easier to test.
- It avoids pgvector setup, embedding costs, and accidental broad profile injection.

## D045-015: UserMemory is supplemental model context and latest user input wins

**Decision**

- Selected UserMemory is injected separately from selected conversation ThreadState.
- Conceptual context order is system/skill/output policy, selected UserMemory, selected conversation summary, pinnedDecisions, recent messages, latest user message.
- Latest user message overrides conflicting UserMemory.

**Rationale**

- UserMemory provides stable preferences, not authority over the current user request.
- Keeping it separate from ThreadState makes cross-conversation leakage and short-term memory regressions easier to test.

## D045-016: Draft first-message memory writes wait for persisted conversation promotion

**Decision**

- If the first draft message contains explicit memory intent or any other eligible memory signal, the route must first create a persisted conversation.
- UserMemory extraction may be enqueued only after assistant final turn completion and only with persisted source conversation identity; any resulting Store write must use that identity and pass validation.
- Failed, cancelled, or rejected draft first messages enqueue zero extraction jobs and write zero UserMemory.
- v0.4.5 does not create ghost conversations solely for memory writes.

**Rationale**

- v0.4.4 established that blank draft is client-local and does not enter the server registry.
- UserMemory requires traceable sourceConversationId and must not weaken draft semantics.

## D045-017: Store failure degrades to no-long-term-memory mode

**Decision**

- Store read failure returns zero selected UserMemory.
- Store write failure returns skipped/rejected result and does not throw into the main chat path.
- Raw database, provider, checkpoint, API key, cookie, or internal runtime errors are not exposed to users.

**Rationale**

- Long-term memory is a supplemental feature.
- Ordinary chat, streaming, selected ThreadState, final-turn memory, Tasklist, and Delivery must continue when UserMemory Store is unavailable.

## D045-018: No public protocol or frontend state change for remembered status

**Decision**

- v0.4.5 does not add a remembered-status stream chunk.
- It does not change `@ai-mind/stream-core` chunk union.
- It does not add frontend reducer public state for memory status.
- It does not add a separate remembered UI.

**Rationale**

- The baseline can acknowledge memory intent in ordinary assistant text.
- Public protocol and reducer compatibility remain hard constraints for this version.

## D045-019: Release evidence must emphasize safety boundaries and non-regression

**Decision**

- Release evidence must prove Store setup/provider behavior, async extraction timing, structured candidate validation, retrieval relevance, suppression, compaction promotion, draft promotion ordering, Store failure degradation, and non-regression.
- Required non-regression includes v0.4.3 final-turn memory, v0.4.4 Conversation Registry and per-conversation ThreadState isolation, Tasklist checkpoint/resume, Delivery run-local behavior, stream-core chunk union, and frontend reducer public shape.

**Rationale**

- UserMemory crosses runtime, Store, context assembly, and safety boundaries.
- The release should be accepted only with focused tests plus compatibility checks across the existing memory/runtime paths.

## D045-020: Memory extraction runs for every eligible completed ordinary turn

**Decision**

- Every eligible completed ordinary text chat or tool-assisted ordinary chat turn MUST enqueue one in-process best-effort memory extraction job.
- Explicit memory intent is a strong signal inside that job, not the only trigger.
- Tasklist and Delivery turns do not enqueue UserMemory extraction jobs in v0.4.5.
- Failed, cancelled, rejected, draft-without-persisted-conversation, and source-less turns do not enqueue extraction jobs.
- The job extracts from the bounded completed turn payload and safe short-term context, not from the full conversation transcript.

**Rationale**

- This aligns v0.4.5 with mainstream extract-then-validate memory systems and avoids a brittle pre-gate rule set.
- Future expansion from explicit preferences to stable implicit preferences can happen inside the same pipeline.
- Excluding Tasklist and Delivery keeps controlled runtime boundaries unchanged.

## D045-021: LLM produces structured candidates, program owns persistence

**Decision**

- The extraction stage uses structured output, preferably JSON schema / zod schema, to produce `0..N` UserMemory candidates.
- The model may output candidate `type`, `text`, `tags`, `confidence`, `stability`, structured `identity`, `action`, `reason`, and `conflictSignal`.
- The model must not output trusted final Store namespace, stable key, status, source conversation identity, or persistence decision.
- The program performs deterministic validation, stable key normalization, dedupe, suppression, and Store write.

**Rationale**

- Semantic extraction is where the model adds value.
- `stability` 让模型显式表达“这条是不是长期稳定信息”，程序只消费该结构字段，不把这层语义判断硬编码成 regex 分类器。
- structured `identity` 让模型显式表达 “这条长期记忆到底围绕什么主题、是否是 prefer/avoid、有没有稳定限定”，程序再做 deterministic normalization，不必继续在代码里维护中文句子语义拆解 helper。
- Store writes need deterministic, testable, and auditable guardrails because persisted memory affects future conversations.

## D045-022: Memory write capability stays behind an internal service boundary

**Decision**

- v0.4.5 implements UserMemory write as an internal runtime service / pipeline.
- The service API remains narrow and runtime-owned.
- v0.4.5 does not expose a memory-write tool to the main assistant.

**Rationale**

- Service-first keeps the baseline simple and testable.
- Avoiding a main assistant memory-write tool prevents prompt-driven writes from bypassing validation and authority boundaries.

## D045-023: PostgresStore setup uses a testable helper and sanitized failures

**Decision**

- `apps/webapp/scripts/setup-user-memory-store.mjs` 只负责入口调用。
- 真实 setup 逻辑下沉到 `apps/webapp/scripts/setup-user-memory-store-lib.mjs`。
- setup 失败时只返回固定前缀和错误名，不暴露 raw `DATABASE_URL` 或 provider internals。

**Rationale**

- 这样可以对 `PostgresStore.fromConnString()`、`store.setup()`、`store.stop()` 和错误脱敏做 focused tests。
- thin entry script 更容易与现有 runtime setup 脚本风格保持一致。

## D045-024: Retrieval uses a minimum score threshold and structured overlap relevance

**Decision**

- retrieval 最终要求 `score >= 1.5` 才允许注入。
- retrieval 主要依赖模型生成的结构化 tags、structured identity、少量规范化 text overlap 和有限的 ASCII token overlap，不再在代码中维护 food / clothing / activity / workflow 这类二级领域关键词分类表。
- `user_preference` 的召回依赖结构化 tags 提供可直接重叠的检索锚点，例如对象词、上位类别词或动作锚点，如 `桃子 / 水果 / 吃`、`卫衣 / 衣服 / 穿`、`VSCode / 工具 / 用`。
- `communication_preference`、`workflow_preference`、`standing_instruction`、`recurring_constraint` 同样应优先依赖结构化 tags 提供可直接重叠的锚点，例如 `解释`、`提示词`、`评估`、`spec`。
- `stable_user_context` / `project_context` / `risk_preference` 必须存在明确的受控词面或 identity overlap，不能因通用话术而被注入。
- `stable_user_context` 允许对职业、工作背景、经验、技术栈这类问题使用有限的短语匹配和 identity 命中，例如 `工作 / 工作经验 / 前端工程师 / Vue / React`，以支持“你知道我的工作吗”这类用户自我信息问题。

**Rationale**

- 这避免了 “推荐”“技术”“需求” 这类宽泛词意外触发无关 memory 注入。
- 同时保留了结构化 tags 带来的可解释性和可测试性，不需要把 retrieval 再做成隐藏的二级领域本体系统。

## D045-025: Exact duplicate active memory is rejected instead of rewritten

**Decision**

- 当现有 document 与新 candidate 在 `stableKey/status/type/text/tags` 上完全一致时，`putCandidate()` 返回 `rejected/duplicate`。
- 只有内容发生变化，才走 `updated` 或 `suppressed`。

**Rationale**

- 这减少无意义写放大，保持 Store 更干净。
- 也让测试能明确区分 “同 key 更新” 和 “完全重复输入”。

## D045-026: Structured extraction schema is strict and extra model fields are unsafe

**Decision**

- `UserMemoryCandidate` 和 `UserMemoryDocument` schema 使用 strict object。
- 模型输出出现未声明字段时，candidate 被 deterministic validation 归类为 `unsafe` 拒绝。

**Rationale**

- 模型只应输出允许的 candidate fields。
- 这能阻止调试字段、原始 provider 元数据或其他意外内容绕过持久化边界。

## D045-027: Stable key uses structured identity normalization

**Decision**

- v0.4.5 的 stable key 采用 structured `identity` 作为主来源。
- `identity` 至少包含 `subject`，可选 `facet`，`user_preference` 允许或要求 `polarity=prefer|avoid`。
- 程序负责对 `identity` 做 deterministic normalization 并拼成最终 `stableKey`。
- stable key derivation 不引入基于中文句子语义拆解的 helper 作为主路径。

**Rationale**

- 这让 “长期记忆的语义理解” 留在模型结构化输出阶段，而不是散落在代码内的句子替换规则里。
- 对偏好、稳定指令、工作流偏好和上下文类长期记忆，structured identity 更容易扩展，也更利于后续调试和演进。
- 程序仍然保留 normalization authority，因此不会把最终 stable key 的决定权完全交给模型。
