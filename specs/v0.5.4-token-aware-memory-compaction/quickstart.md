# Quickstart: Token-aware Memory Compaction Validation

## Purpose

本文件是实现完成后的验证指南。当前文档阶段只记录基线结果；除 baseline 外的步骤在实现前不得标记通过。

## Prerequisites

- Node.js 22
- pnpm 10.34.0
- dependencies 已安装
- unit tests 不要求数据库或云端 key
- live smoke 需要显式配置相应 Provider；不得在日志或 acceptance 中复制 key、prompt 或回答正文

## Baseline Recorded Before Implementation

2026-09-01 在 `v0.5.3` 基线运行：

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/lib/ai/runtime/chat-memory-compaction.test.ts `
  tests/lib/ai/runtime/chat-memory-service.test.ts `
  tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts
```

结果：3 test files passed，19 tests passed，0 failed。

## Phase 1: Budget and Provider Contracts

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/lib/ai/model-provider/model-catalog.test.ts `
  tests/lib/ai/model-provider/model-provider-config.test.ts `
  tests/lib/ai/model-provider/context-budget.test.ts `
  tests/lib/ai/model-provider/token-estimator.test.ts `
  tests/lib/ai/model-provider/ollama-provider.test.ts
```

Expected:

- cloud exact budget: 111104 / 77772 / 38886
- Ollama exact budget: 20480 / 14336 / 7168
- every enabled catalog model has positive physical window metadata
- PublicChatModel response remains unchanged
- Ollama receives `numCtx=32768`

## Phase 2: Persistent Compaction

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/lib/ai/runtime/chat-memory-state.test.ts `
  tests/lib/ai/runtime/chat-memory-compaction.test.ts `
  tests/lib/ai/runtime/chat-memory-service.test.ts `
  tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts
```

Expected:

- raw message count alone never triggers compaction
- crossing token trigger invokes at most one attempt
- valid candidate is at/below target and smaller than source
- oversized latest turn is summarized, not split
- generator/schema/candidate failure preserves prior summary/pins/timestamp and independently appends the latest completed turn
- candidate save failure followed by raw append success persists only the complete raw turn from last durable state
- raw append failure preserves last durable state, emits only sanitized diagnostics and does not invalidate the answer

## Phase 3: Orchestrator Continuity

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/lib/ai/runtime/chat-orchestrator.test.ts `
  tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts `
  tests/lib/ai/runtime/chat-context-preflight.test.ts `
  tests/app/api/chat/route.test.ts
```

Expected:

- direct/tool/composer/capability final paths use the same preflight
- compaction failure and still-over candidate use ephemeral fit and call the model
- generator/schema/candidate/candidate-save failures each reach a model-ready ephemeral fit
- pins alone over the available memory budget retain newest complete pins for this request without mutating the checkpoint
- non-memory-only overflow returns existing error
- “Vue 3 的响应式系统为什么要用 Proxy？” reaches the answer model after compaction

## Phase 4: Compatibility Regression

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/app/api/chat/thread/route.test.ts `
  tests/lib/ai/runtime/chat-memory-hydration-dto.test.ts `
  tests/lib/ai/runtime/chat-memory-final-turn-adapter.test.ts `
  tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts `
  tests/lib/ai/runtime/delivery-chain.test.ts `
  tests/components/instamind/use-chat-stream-thread-memory-status.test.tsx `
  tests/components/instamind/thread-memory-status-hint.test.tsx
```

Then run:

```powershell
pnpm test:stable
pnpm typecheck
pnpm --dir apps/webapp lint
git diff --check
```

## Phase 5: Composer Chat Memory Usage Hint

```powershell
pnpm --dir apps/webapp exec vitest run `
  tests/app/api/chat/context-usage/route.test.ts `
  tests/components/instamind/use-chat-memory-usage.test.tsx `
  tests/components/chat/composer/toolbar/context-usage-indicator.test.tsx `
  tests/components/chat/composer/toolbar/composer-toolbar.test.tsx
```

Expected:

- usage route validates conversation ownership and returns only `usedPercent` plus `effectiveWindowTokens`
- cloud model uses 128K, Ollama uses 32K (or a lower physical clamp) as the percentage denominator
- persisted chat memory is the only numerator; no raw memory, raw token count or provider config enters the browser response
- toolbar shows a no-number circular indicator after skill mode only when a safe summary exists
- hover/focus Tooltip reads `聊天上下文已使用 xx%（128K/32K）`; no compression button/action exists
- model switch and normal `finish` refresh after returning idle; draft, streaming and fetch failures hide the indicator without blocking chat

## Phase 5.5: Persistent Scroll Intent

从仓库根运行：

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/components/instamind/chat-scroll-intent.test.tsx tests/components/instamind/use-chat-scroll-policy.test.tsx tests/components/instamind/conversation-session.test.tsx tests/components/instamind/use-chat-stream.test.tsx tests/components/instamind/use-chat-memory-usage.test.tsx tests/components/chat/message-list
node apps/webapp/tests/browser/chat-scroll-regression.mjs
node scripts/validate/check-test-locations.mjs apps/webapp
```

先安装 workspace 依赖；Playwright 1.62.1 已声明为 webapp 开发依赖。浏览器脚本使用已安装 Chrome（PW_CHANNEL 可选择本机 Playwright channel），在 127.0.0.1:4175 自启 Vite 并关闭；API 为测试侧内存 fixture，不访问模型或用户会话。测试真实 InstantMindPage、session/stream hooks 和 Virtuoso，并覆盖 1000 条混合消息。以同一浏览器采样帧的底部距离 <=4px 判定到达；持续流中下一次增量可能已改变高度。

预期：首问跨 promotion 不卸载；续问、结束后建议/图片/Composer 继续 following；用户上翻与手动展开停止，按钮/实际向下回底恢复；真实切换取消旧工作。保持 bounded DOM。外部 viewport 禁用浏览器 overflow-anchor，尺寸补偿交由 Virtuoso。

## Phase 6: Opt-in Live Smoke

分别选择一个 Qwen cloud、DeepSeek V4 和本地 Ollama Qwen3 模型：

1. 准备足够触发压缩的 synthetic conversation，不复制真实用户正文。
2. 观察一次 started → completed/failed 状态能正常终止。
3. 压缩后发送 Vue Proxy 问题，确认收到正常 assistant answer。
4. 强制 compaction provider failure，确认主 answer model 仍被调用。
5. Ollama 使用 `ollama ps` 确认 context 为 32768，并记录显存/CPU offload 情况。
6. acceptance 只记录 model id、预算数字、pass/fail 和时间；不记录 prompt、answer、key 或 provider config。

本地 Ollama 因主机性能需要更长 smoke 等待时，可设置 `AI_MIND_CHAT_MEMORY_COMPACTION_SMOKE_TIMEOUT_MS`；默认 30,000ms，最小 1,000ms、最大 120,000ms。该变量只影响 external smoke test timeout，不改变 Runtime budget 或 Provider 配置。

## Stop Conditions

- 任一 public DTO/stream schema 意外变化。
- 任一 failure path 覆盖旧 checkpoint 或留下半轮。
- 完整输入仍由字符级 guard 拒绝。
- non-memory overflow 被错误地归因为 memory compaction。
- logs 或 test snapshots 包含原始聊天正文、prompt、tool payload 或 secrets。
