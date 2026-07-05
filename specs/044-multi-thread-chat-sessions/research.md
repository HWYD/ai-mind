# Research: AI Mind v0.4.4 Minimal Multi-thread Chat Sessions

**Feature**: [spec.md](./spec.md)  
**Date**: 2026-07-04

## Decision: Conversation Registry stays in chat-memory runtime state

**Rationale**: v0.4.4 的定位是 short-term memory container，不是完整聊天历史系统。把一个有上限、只属于 current browser session 的 registry 放进现有 chat-memory 边界，最符合 v0.4.2 / v0.4.3 的延续方向，也能避免把本版拉成 Prisma business history 工程。

**Alternatives considered**:

- 新增 ChatSession / ChatMessage tables：拒绝。spec 已经明确排除了 full history system 与 business history tables。
- 只把 registry 放在 localStorage：拒绝。server-authoritative context 与 final-turn writes 仍然需要服务端校验。
- 直接做 account-level history：拒绝。v0.4.4 不引入登录态与跨设备同步语义。

## Decision: New chat stays in pure draft state until the first user message

**Rationale**: 对主流聊天产品来说，用户点“新聊天”时只是进入一个新的 blank working surface，而不是立即制造一条正式历史。纯 draft state 可以保持 recent/history 语义干净，也避免服务端 registry 被空会话污染。

**Alternatives considered**:

- 点击“新聊天”时立即创建 persisted empty conversation：拒绝。会带来 ghost recent entry、empty-pruning 复杂度和跨端过滤补丁。
- 继续保留空会话但只在 UI 层隐藏：拒绝。会让 server registry、contracts 和后续历史语义持续不一致。
- 不支持 blank draft，必须先选旧会话：拒绝。会损失多会话最核心的新上下文入口。

## Decision: Use a new conversation-scoped chat memory thread namespace

**Rationale**: 当前 `chat:${sessionHash}` 表达的是“每个 browser session 一个 thread”。v0.4.4 明确不迁移也不复用这个 legacy identity。新的 namespace 可以在保留现有 LangGraph checkpoint storage 机制的前提下，让每个 conversation 对应一个独立 ThreadState。

**Alternatives considered**:

- 继续复用 `chat:${sessionHash}`，在 ThreadState 内部分区：拒绝。会把原本 single-thread state 过载，compaction / hydration 复杂度也会上去。
- 让 public `conversationId` 直接等于 thread id：拒绝。public DTO 不应该暴露 raw session / checkpoint internals。
- 直接复用 Tasklist Agent thread ids：拒绝。Tasklist checkpoint/resume semantics 必须保持独立。

## Decision: Keep ThreadState text-only and unchanged

**Rationale**: v0.4.2 和 v0.4.3 已经把 `messages`、`summary`、`pinnedDecisions`、`lastCompactedAt` 稳定为 text-only short-term memory state。v0.4.4 改的是 ownership，不是 state shape。这样最能保护 hydration、compaction、reducer compatibility 和 final-turn safety。

**Alternatives considered**:

- 给每条 ChatThreadMessage 持久化 `conversationId`：拒绝。ownership 完全可以由 thread id + registry 来保证，没必要改 message schema。
- 加 source badge / agent badge：拒绝。属于明确 non-goals。
- 加 contextEntries / execution summaries：拒绝。会把版本边界推向 history / long-term memory 方向。

## Decision: Sort and prune persisted conversations by last active time with a 10-conversation limit

**Rationale**: 大部分聊天产品里的“最近会话”更接近“最近使用”，而不是“最近创建”。对 AI 使用场景来说，切回旧会话继续工作，本身就是活跃行为。把上限压到 10，也能更清楚地维持“MVP 短期记忆容器”的产品边界。由于 blank draft 不进入 registry，这个上限只约束 persisted conversations。

**Alternatives considered**:

- 保留 20 条：拒绝。对 MVP 来说会让 short-term boundary 变松，桌面和移动端都更像完整历史系统。
- 只按 last message time 排序：拒绝。completed assistant turn 也是用户可感知的会话活跃信号，recent 排序不应只盯住最后一条 user message。
- 单纯切换会话就更新 recent 排序：拒绝。会让列表在浏览/查看阶段过于频繁抖动，不符合主流聊天产品对 recent list 的稳定预期。
- 按 creation time 排序：拒绝。不符合“最近会话”的直觉预期。

## Decision: Server-validated selected conversation is authoritative

**Rationale**: 前端可以保存 last selected conversation 作为体验优化，但服务端 registry membership 才决定某个 conversation 能不能被 hydrate、接收 model context 或 final-turn writes。这样可以避免 stale client state 指向无效或越权 conversation。

**Alternatives considered**:

- 让 localStorage 变成 source of truth：拒绝。它不能保护服务端 memory isolation。
- 把最新 `updatedAt` 作为 primary active rule：拒绝。后台写入或 prune 后会让用户感知变得不可预测。
- 缺少 `conversationId` 时自动推 default：拒绝。v0.4.4 应该避免猜测，减少错写 thread 的风险。

## Decision: Keep streaming guard outside stream protocol

**Rationale**: 现有 stream protocol 已经承载 assistant output 和 memory compaction hints。v0.4.4 只需要防止 stream 进行中切换 selected conversation，这可以在 UI/runtime ownership state 层面解决，不需要改 `@ai-mind/stream-core`。

**Alternatives considered**:

- 新增 conversation-switch chunks：拒绝。没有协议层需求。
- 允许切换，并按 stream id 重新路由 chunks：拒绝。对 MVP 来说复杂度明显偏高。
- 允许排队切换，等 stream 结束再应用：拒绝。相比 disabled controls，可预期性更差。

## Decision: Keep Tasklist and Delivery runtime semantics unchanged

**Rationale**: Tasklist Agent 自己拥有 GraphState / checkpoint / resume 语义；Delivery 继续保持 run-local。v0.4.4 只改变 completed user-visible final text 最终写入哪个 chat memory thread，不改变这些 runtime 的本体语义。

**Alternatives considered**:

- 把 Tasklist / Delivery internals 一起写进 conversation memory：拒绝。raw runtime state 不安全，而且超出版本范围。
- 让 conversation registry 兼任 AgentRun registry：拒绝。两者 ownership 与 lifecycle 完全不同。
- 给 Delivery 新增 checkpoint / resume semantics：拒绝。与 Delivery 的 run-local 定位冲突。
