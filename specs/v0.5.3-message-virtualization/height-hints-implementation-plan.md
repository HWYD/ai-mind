# Persisted Message Height Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Virtuoso 已稳定测量的 completed history message 高度保存为本地、可失效的暖缓存，并在同一消息列宽的后续首次 size-tree 构建中优先复用，以降低真实长会话 CLS。

> **D027 status update**: 本文件中的 cold/warm 数值门槛现为诊断建议；canonical `tasks.md` 与 `acceptance.md` 以产品负责人确认的真实浏览器行为决定 v0.5.3 收口，不再以 CLS、hit rate 或 DOM peak 数值阻塞。

**Architecture:** 现有结构化 estimator 保持冷启动 fallback；独立 IndexedDB store 保存 `conversation + layout + message` 高度提示。`ChatMessageList` 只消费 Virtuoso 公共 `itemsRendered.size`，经过稳定/资格门控后批量写入，不新增 DOM measurement owner，也不保存/恢复 scroll state。

**Tech Stack:** TypeScript 5.x、React 19.2.4、Next.js 16.1.6、免费 `react-virtuoso@4.18.12`、IndexedDB、Zod、Vitest、Testing Library、Chrome Performance/Local Metrics。

## Global Constraints

- 继续使用免费 MIT `react-virtuoso@4.18.12`；禁止商业 Message List。
- Virtuoso 是 item measurement、size tree、回收和物理滚动的唯一 owner。
- 不读写 `scrollTop` / `scrollHeight`，不持久化或恢复完整 `StateSnapshot`。
- 不新增消息内容 `ResizeObserver`，不在 streaming/submitted 或每个 token 时写 IndexedDB。
- 高度提示不进入 `MindMessage`、conversation snapshot、localStorage、API、服务端或日志正文。
- cache miss/invalid/quota/unavailable 必须静默回退现有结构化 estimator。
- 第一版只缓存 completed、history、默认 disclosure；真实 measurement 永远覆盖 hint。
- DOM 根节点上限保持 `<=50`，`followOutput={false}`、buffer、120px threshold 和 Scroll Policy 不变。

---

### Task 1: Define and validate the local height-hint record

**Files:**

- Modify: `apps/webapp/components/instamind/local-chat-persistence/schema.ts`
- Test: `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`

**Interfaces:**

- Produces: `LocalMessageHeightHintEntry`, `LocalMessageHeightHintRecord`, `localMessageHeightHintRecordSchema`, `LOCAL_MESSAGE_HEIGHT_HINT_SCHEMA_VERSION`.
- Consumes: existing ISO datetime and local persistence result conventions.

- [ ] **Step 1: Write schema red tests**

```ts
const validRecord = {
    key: 'conversation-1::g1|w856|r0|history-default',
    conversationId: 'conversation-1',
    entries: [
        {
            height: 432.25,
            measuredAt: '2026-08-30T00:00:00.000Z',
            messageId: 'assistant-1',
            presentation: 'history-default',
            renderFingerprint: 'fp-1234',
        },
    ],
    geometryVersion: 1,
    layoutKey: 'g1|w856|r0|history-default',
    messageColumnWidth: 856,
    schemaVersion: 1,
    updatedAt: '2026-08-30T00:00:00.000Z',
}

expect(localMessageHeightHintRecordSchema.safeParse(validRecord).success).toBe(true)
expect(localMessageHeightHintRecordSchema.safeParse({ ...validRecord, scrollTop: 120 }).success).toBe(false)
expect(localMessageHeightHintRecordSchema.safeParse({ ...validRecord, entries: [{ ...validRecord.entries[0], height: 0 }] }).success).toBe(
    false
)
```

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
pnpm --dir apps/webapp exec vitest run tests/components/instamind/local-chat-persistence.test.ts --reporter=verbose
```

Expected: FAIL because the new schema/types are not exported.

- [ ] **Step 3: Implement the strict schema**

```ts
export const LOCAL_MESSAGE_HEIGHT_HINT_SCHEMA_VERSION = 1

export const localMessageHeightHintEntrySchema = z
    .object({
        height: z.number().finite().positive().max(100_000),
        measuredAt: z.string().datetime(),
        messageId: z.string().min(1),
        presentation: z.literal('history-default'),
        renderFingerprint: z.string().min(1),
    })
    .strict()

export const localMessageHeightHintRecordSchema = z
    .object({
        key: z.string().min(1),
        conversationId: z.string().min(1),
        entries: z.array(localMessageHeightHintEntrySchema).max(2_000),
        geometryVersion: z.number().int().positive(),
        layoutKey: z.string().min(1),
        messageColumnWidth: z.number().int().min(240).max(2_000),
        schemaVersion: z.literal(LOCAL_MESSAGE_HEIGHT_HINT_SCHEMA_VERSION),
        updatedAt: z.string().datetime(),
    })
    .strict()
```

- [ ] **Step 4: Re-run the focused test**

Expected: schema cases PASS; existing snapshot/index schemas remain strict and unchanged.

- [ ] **Step 5: Review/commit gate**

Stage only the two files above and use commit message `feat(webapp): define local message height hints` after reviewer approval.

---

### Task 2: Add the isolated IndexedDB store and retention rules

**Files:**

- Modify: `apps/webapp/components/instamind/local-chat-persistence/store.ts`
- Modify: `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`

**Interfaces:**

- Produces:

```ts
readLocalMessageHeightHints(conversationId: string, layoutKey: string): Promise<LocalReadResult<LocalMessageHeightHintRecord>>
writeLocalMessageHeightHints(record: LocalMessageHeightHintRecord): Promise<LocalWriteResult>
deleteLocalMessageHeightHints(conversationIds: string[]): Promise<void>
```

- Consumes: Task 1 schemas and existing best-effort IndexedDB error handling.

- [ ] **Step 1: Add DB upgrade/CRUD/eviction red tests**

Cover these exact behaviors:

```ts
expect(openedDatabaseVersion).toBe(3)
expect(createdStores).toContain('message-height-hints')
expect(await readLocalMessageHeightHints('conversation-1', layoutKey)).toMatchObject({ status: 'valid' })
expect(await readLocalMessageHeightHints('conversation-1', 'other-layout')).toEqual({ status: 'missing' })
expect(recordsForConversation).toHaveLength(3)
expect(recordsForConversation.map(record => record.layoutKey)).not.toContain(oldestLayoutKey)
```

Also assert invalid records return `invalid`, quota returns `quota`, unavailable returns `unavailable`, and `deleteLocalConversationSnapshots(['conversation-1'])` removes the corresponding hint variants without failing snapshot cleanup.

- [ ] **Step 2: Run the test and confirm red**

Expected: FAIL for missing store/functions and database version still `2`.

- [ ] **Step 3: Implement DB version 3**

Use constants:

```ts
const DATABASE_VERSION = 3
const MESSAGE_HEIGHT_HINT_STORE = 'message-height-hints'
const MESSAGE_HEIGHT_HINT_CONVERSATION_INDEX = 'conversationId'
const LOCAL_MESSAGE_HEIGHT_HINT_MAX_LAYOUTS_PER_CONVERSATION = 3
```

The upgrade only creates the new store with `keyPath: 'key'` and a non-unique `conversationId` index. `writeLocalMessageHeightHints` writes the new record and deletes older variants for the same conversation in the same readwrite transaction. Extend existing conversation cleanup to best-effort delete hints by the index.

- [ ] **Step 4: Re-run local persistence tests**

Expected: all new and existing index/snapshot/image tests PASS.

- [ ] **Step 5: Review/commit gate**

Stage only store/tests and use commit message `feat(webapp): persist bounded message height hints` after reviewer approval.

---

### Task 3: Build pure layout, fingerprint, eligibility and candidate rules

**Files:**

- Create: `apps/webapp/components/chat/message-list/message-height-hints.ts`
- Create: `apps/webapp/tests/components/chat/message-list/message-height-hints.test.ts`

**Interfaces:**

- Produces:

```ts
export const MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION = 1

export function createMessageHeightLayoutKey(input: { enableReasoning: boolean; messageColumnWidth: number }): string

export function createMessageRenderFingerprint(message: MindMessage, requestComposer: ChatComposerPayload | undefined): string

export function resolveCachedMessageHeight(input: {
    entry: LocalMessageHeightHintEntry | undefined
    expectedFingerprint: string
}): number | undefined

export function updateStableHeightCandidate(current: StableHeightCandidate | undefined, nextSize: number): StableHeightCandidate
```

- Consumes: Task 1 entry type, `MindMessage`, `ChatComposerPayload`.

- [ ] **Step 1: Write pure red tests**

```ts
expect(createMessageHeightLayoutKey({ enableReasoning: false, messageColumnWidth: 856 })).toBe('g1|w856|r0|history-default')
expect(createMessageHeightLayoutKey({ enableReasoning: false, messageColumnWidth: 855 })).not.toBe(desktopKey)
expect(createMessageRenderFingerprint(completedMessage, composer)).toBe(
    createMessageRenderFingerprint(structuredClone(completedMessage), composer)
)
expect(createMessageRenderFingerprint(changedTextMessage, composer)).not.toBe(originalFingerprint)
expect(resolveCachedMessageHeight({ entry: matchingEntry, expectedFingerprint: matchingEntry.renderFingerprint })).toBe(432.25)
expect(resolveCachedMessageHeight({ entry: matchingEntry, expectedFingerprint: 'changed' })).toBeUndefined()
expect(updateStableHeightCandidate(updateStableHeightCandidate(undefined, 432.22), 432.24).stableCount).toBe(2)
```

Fingerprint input must include render-relevant text/reasoning/tool/resource/prompt/workflow/agent/image dimensions/status/visibility and request composer presentation conditions, but the returned stored value must be a fixed local hash rather than source content.

- [ ] **Step 2: Run the new test and confirm red**

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal pure functions**

Normalize stable sizes with:

```ts
const normalizedSize = Math.round(nextSize * 4) / 4
```

Reject non-finite, zero and values above `100_000`. A candidate becomes writable only when the same normalized size is observed at least twice. Keep the module free of React, DOM, IndexedDB and scroll behavior.

- [ ] **Step 4: Re-run the new test**

Expected: all layout/fingerprint/cache/candidate tests PASS.

- [ ] **Step 5: Review/commit gate**

Use commit message `feat(webapp): model stable message height hints` after reviewer approval.

---

### Task 4: Load matching hints before the first Virtuoso size tree

**Files:**

- Modify: `apps/webapp/components/chat/message-list/chat-message-list.tsx`
- Modify: `apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx`

**Interfaces:**

- Consumes: Tasks 2–3 read/layout/fingerprint APIs.
- Produces: initial `heightEstimates` with per-item cache precedence and width-generation cancellation.

- [ ] **Step 1: Add cache-precedence and async-generation red tests**

```ts
expect(virtuosoHarness.props?.heightEstimates[historyIndex]).toBe(432.25)
expect(virtuosoHarness.props?.heightEstimates[missIndex]).toBe(structuralEstimate)
expect(virtuosoHarness.renderCountBeforeHintRead).toBe(0)

resolveReadForWidth(856, desktopRecord)
resizeScrollParentTo(324)
resolveReadForWidth(324, mobileRecord)
expect(virtuosoHarness.props?.heightEstimates[historyIndex]).toBe(mobileHeight)
expect(virtuosoHarness.props?.heightEstimates[historyIndex]).not.toBe(desktopHeight)
```

Add cases for missing/invalid/unavailable read continuing with structural estimates and empty/draft lists not waiting for a cache read.

- [ ] **Step 2: Run the focused message-list test and confirm red**

Run:

```powershell
pnpm --dir apps/webapp exec vitest run tests/components/chat/message-list/chat-message-list.test.tsx --reporter=verbose
```

- [ ] **Step 3: Implement pre-mount read and merge**

Because `scrollParent` is committed before a non-empty `ChatMessageList` mounts, initialize `messageColumnWidth` from its current bounding width in the state initializer, then keep the existing width observer for later changes. For a persisted conversation, build a monotonic read generation; mount Virtuoso only after the current generation returns valid/missing/invalid/unavailable. Merge hints inside the existing O(n) `messageEntries` traversal:

```ts
const cachedHeight = resolveCachedMessageHeight({
    entry: cachedEntriesByMessageId.get(message.id),
    expectedFingerprint,
})
estimates.push(cachedHeight ?? estimateMessageHeight(message, messageColumnWidth, context))
```

Do not add a timeout, network request, scroll command or second list path. Existing history skeleton remains visible while local read is pending; after mount, existing generation-scoped tail positioning owns reveal.

- [ ] **Step 4: Re-run message-list and page history tests**

Run:

```powershell
pnpm --dir apps/webapp exec vitest run tests/components/chat/message-list/chat-message-list.test.tsx tests/app/instant-mind/page.test.ts --reporter=verbose
```

Expected: new cache tests and existing bootstrap/reveal tests PASS.

- [ ] **Step 5: Review/commit gate**

Use commit message `feat(webapp): apply warm heights to initial estimates` after reviewer approval.

---

### Task 5: Capture only stable default-history sizes and batch writes

**Files:**

- Modify: `apps/webapp/components/chat/message-list/chat-message-list.tsx`
- Modify: `apps/webapp/components/chat/message-list/message-disclosure-provider.tsx`
- Modify: `apps/webapp/tests/components/chat/message-list/chat-message-list.test.tsx`
- Create: `apps/webapp/tests/components/chat/message-list/message-disclosure-provider.test.tsx`

**Interfaces:**

- Consumes: Virtuoso `itemsRendered(items: ListItem<MessageEntry>[])`, Task 2 write API, Task 3 candidate rules.
- Produces: best-effort idle persistence with zero streaming writes.

- [ ] **Step 1: Add write-gate red tests**

Assert all of the following:

```ts
emitItemsRendered([{ data: completedHistoryEntry, index: 4, offset: 0, size: 432.25 }])
emitItemsRendered([{ data: completedHistoryEntry, index: 4, offset: 0, size: 432.25 }])
emitScrolling(false)
await flushFontsAndIdle()
expect(writeLocalMessageHeightHints).toHaveBeenCalledTimes(1)

expectWritesFor({ status: 'streaming' }).toBe(0)
expectWritesFor({ latestAssistant: true }).toBe(0)
expectWritesFor({ disclosureDeviation: true }).toBe(0)
expectWritesFor({ sizes: [400, 432] }).toBe(0)
```

Also test cancellation on conversation/width generation change and multiple eligible items coalescing into one record write.

- [ ] **Step 2: Run message-list/disclosure tests and confirm red**

- [ ] **Step 3: Make disclosure state report only deviations**

Extend `MessageDisclosureProvider` with:

```ts
onDeviationKeysChange?: (keys: ReadonlySet<string>) => void
```

When a controlled value returns to its `defaultOpen`, remove that key from the provider store; otherwise retain it. `ChatMessageList` already knows valid keys per message, so it can skip candidate promotion when any key for that message is in the deviation set. Do not persist disclosure state.

- [ ] **Step 4: Implement callback-only candidate capture**

Wrap the existing `isScrolling` callback so policy observations still receive the original value. `itemsRendered` only updates refs. When scrolling stops and status is neither submitted nor streaming, wait for `document.fonts.ready`, require two equal normalized observations, then schedule one idle/rAF batch for current conversation/layout generation. Skip current latest assistant and any message with disclosure deviations. On unmount or generation change, cancel pending work.

- [ ] **Step 5: Run focused tests**

Expected: one settled batch write, zero streaming/default-mismatch writes, and all existing Scroll Policy callback assertions PASS.

- [ ] **Step 6: Review/commit gate**

Use commit message `feat(webapp): cache stable virtuoso item sizes` after reviewer approval.

---

### Task 6: Verify cold/warm behavior and close the decision gate

**Files:**

- Modify: `specs/v0.5.3-message-virtualization/acceptance.md`
- Modify: `specs/v0.5.3-message-virtualization/tasks.md`
- Modify only if evidence changes the design: `spec.md`, `plan.md`, `data-model.md`, `contracts/chat-message-viewport.md`, `decisions.md`

**Interfaces:**

- Consumes: Tasks 1–5 complete implementation.
- Produces: automated regression evidence and real Chrome cold/warm decision.

- [ ] **Step 1: Run targeted automated verification**

```powershell
pnpm --dir apps/webapp exec vitest run tests/components/instamind/local-chat-persistence.test.ts tests/components/chat/message-list/message-height-hints.test.ts tests/components/chat/message-list/chat-message-list.test.tsx tests/components/chat/message-list/message-disclosure-provider.test.tsx tests/components/instamind/use-chat-scroll-policy.test.tsx tests/app/instant-mind/page.test.ts --reporter=verbose
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

Record exact pass counts and any unavailable check; do not report an interrupted lint as passing.

- [ ] **Step 2: Establish cold baseline**

For each dataset/viewport, clear only `message-height-hints`, reset Chrome Local Metrics, then run the fixed 20-light-up-scroll plus drag path. Record CLS, largest shift cluster, max item correction, total-height delta, write count, DOM peak and console errors. Do not send/stream in the 1,000 fixture.

- [ ] **Step 3: Warm from real rendering**

Let the same path render and settle, confirm the tested region has `>=90%` eligible hint coverage, refresh without changing width/zoom/DevTools docking, reset metrics and repeat the identical path. The seed must not prepopulate hints.

- [ ] **Step 4: Run invalidation and streaming checks**

Change desktop to `324×534` and confirm desktop hints miss. Increment a test geometry version and confirm all old hints miss. In the standalone streaming harness, confirm zero writes while streaming；当该 completed message 后续成为 eligible history/default presentation 时，确认一次 idle batch 至多一笔写入；current stream growth 仍只遵循现有 Scroll Policy。

- [ ] **Step 5: Apply the decision gate**

Keep the production cache only when warm real CLS is at least 50% lower than cold and `<=0.25`, with DOM `<=50`, zero new console errors and no ownership violation. Continue toward the `<=0.1` target. If the gate fails, leave T092 incomplete, identify miss/late-size causes from item/total deltas, and either correct signatures/eligibility or revert Tasks 4–5 while retaining Tasks 1–3 only if they have independent diagnostic value.

- [ ] **Step 6: Sync canonical evidence**

Replace the planned acceptance table with actual numbers, mark only evidenced tasks complete, and update D025 if the implementation is reverted or narrowed. Use commit message `test(webapp): verify warm message height hints` after reviewer approval.

---

## Self-review Result

- Spec coverage: FR-564–FR-569 and SC-547–SC-550 each map to Tasks 1–6.
- Type consistency: schema/store/pure-policy/list interfaces use the same `LocalMessageHeightHintRecord` and `history-default` presentation names.
- Scope: no server/API/protocol changes, no statistical self-learning model, no legacy backfill job, no scroll restoration.
- Failure semantics: every storage/read/signature failure has an explicit structural-estimator fallback.
- Verification: both fixture and real data, desktop/mobile, cold/warm, invalidation and streaming write gates are covered.
