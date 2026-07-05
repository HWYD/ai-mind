# Implementation Plan: AI Mind v0.4.4 Minimal Multi-thread Chat Sessions

**Branch**: `[044-multi-thread-chat-sessions]` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: 来自 `specs/044-multi-thread-chat-sessions/spec.md` 的 feature specification

**Note**: 本文遵循 Spec Kit 的 planning workflow。它记录 v0.4.4 的实现设计、边界和验证思路，不直接实现生产代码。

## Summary

v0.4.4 把 AI Mind 的 chat memory 从“一个 browser session 只有一个 chat thread”扩展为“一个 browser session 可以拥有多个 conversation 容器”。当前 browser session 持有一个有上限的 Conversation Registry，最多保留 10 个最近活跃的 persisted conversations。点击“新聊天”时，前端只进入一个 client-local blank draft state；只有首条 user message 真正提交时，系统才创建正式 conversation、分配 thread ownership，并把它加入 registry。

技术方案刻意保持很小：继续复用 `apps/webapp` 现有的 chat-memory runtime、safe hydration、compaction 和 final-turn append 行为；只增加 session-scoped registry、draft-to-conversation promotion path 和 conversation-scoped thread id；让 hydrate / UI state 围绕 persisted `conversationId` 工作，让首条 draft send 走显式 create path；同时保持 `@ai-mind/stream-core`、frontend reducer public shape、Tasklist checkpoint/resume、Delivery run-local semantics 和 Prisma business schema 不变。会话 UI 继续站在当前 `instant-mind` 聊天页壳层、本地 `shadcn/ui` 组件基线和 `radix-vega` 风格上演进，不把 landing 页视觉或 MCP 组件获取链路引入本版实现。基于本轮 `shadcn` MCP review，v0.4.4 后续 UI 收敛优先级调整为：凡是存在合适本地 `shadcn/ui` primitive 的 in-scope 会话组件，尽量在本版内完成 primitive-level convergence，而不是继续保留仅承担展示职责的 bespoke shell。

## Technical Context

**Language/Version**: TypeScript 5.9, React 19.2, Next.js 16.1, Node.js runtime

**Primary Dependencies**: `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `zod`, `@ai-mind/stream-core`, `@ai-mind/database`, local `shadcn/ui` (`radix-vega`) component baseline, lucide-react, Vitest

**Storage**: 继续使用现有 chat-memory checkpoint 边界保存 short-term memory 和 persisted registry state；不新增 Prisma 管理的 ChatSession/ChatMessage business tables。blank draft 只存在于 client-local UI / client persistence 边界，不写入 server registry。生产环境 chat memory 仍然走 PostgreSQL-backed LangGraph checkpoint storage；开发和测试环境可以继续使用 memory checkpoint mode。

**Testing**: 以 `apps/webapp/tests` 下的 focused route/runtime/hydration/UI tests 为主，补充 stream-core protocol non-regression tests，并在最后执行 `pnpm typecheck` 与 `pnpm lint:webapp`

**Target Platform**: AI Mind webapp，本地开发与容器化生产部署

**Project Type**: 带前端状态、Next.js API routes、AI runtime、stream protocol package 与 shared database package 的 web application

**Performance Goals**:

- 初始 registry hydration 只返回一个有上限的 persisted recent conversation list，长度不超过 10
- 切换会话时只 hydrate 一个 selected persisted conversation 的 ThreadState
- blank draft 不触发 persisted hydration；首条 user message promotion 必须在 active stream ownership 建立前完成
- completed final-turn memory write 仍然是一轮 assistant 完成后最多写一次，而不是按 stream chunk 写
- desktop sidebar 与 mobile drawer 在 10 个会话、长标题场景下仍保持可用

**Constraints**:

- 不迁移，也不复用 legacy `chat:${sessionHash}` 作为 v0.4.4 的 conversation identity
- 不暴露 raw session id、raw checkpoint、provider response、GraphState、RuntimeArtifact、workflow progress、raw tool transcript、API key、cookie value 或 provider config
- persisted ThreadState 仍然只保存 `messages`、`summary`、`pinnedDecisions`、`lastCompactedAt`
- Conversation Registry 只属于 current browser session，不是 account history，也不是 global history
- registry / sidebar / mobile drawer 最多保留 10 个 persisted conversations，按 last active time 排序
- blank draft 不进入 server-side registry，也不触发 empty-conversation pruning
- assistant 正在 streaming 时，new chat 和 switch conversation 都必须禁用
- 会话 UI 优先复用 `apps/webapp/components/ui/` 的现有本地 `shadcn/ui` 组件；如果缺少 drawer / sheet / sidebar 等通用 primitive，按当前 `radix-vega` 基线在仓库内补齐
- 不把 MCP、remote UI registry 或运行时 capability surface 作为 v0.4.4 UI 组件来源依赖
- `shadcn` MCP 只作为规划、review、对标和 add-command 参考来源，不进入运行时依赖链
- 对于 v0.4.4 in-scope 会话 UI，只要存在合适的本地 `shadcn/ui` primitive，就优先替换现有 bespoke presentational shell
- 缺失 primitive 时优先补 `apps/webapp/components/ui/` 本地 primitive，不直接引入整套 example/block 模板
- primitive 级替换优先级以 `sidebar`、`scroll-area`、`skeleton`、`alert` 为先；移动端左侧会话抽屉保持 `sheet` 语义，不强制切换到 `drawer`
- 视觉主题和交互壳层优先继承当前 `apps/webapp/components/instamind/instantmind-page.tsx` 与 `apps/webapp/app/globals.css` token，而不是切到 landing / marketing page 风格
- 不改 stream-core chunk union，也不破坏 frontend reducer public shape

**Scale/Scope**:

- 一个 browser session 在 v0.4.4 中最多保留 10 个 persisted conversations
- UI 同时只激活一个 selected conversation
- 页面同一时刻只支持一个 active chat stream
- 本版覆盖 ordinary chat、tool / MCP / resource final turns、Tasklist final answers 和 Delivery final reports 进入 selected conversation memory 的路径

## Constitution Check

_GATE: 必须在 Phase 0 research 前通过，并在 Phase 1 design 后再次检查。_

**Controlled Agent First**: PASS。v0.4.4 不引入新 Agent，不扩大 Tasklist Agent authority，也不改变 model selection 权限边界。

**GraphState Is Runtime Source of Truth**: PASS。Tasklist GraphState 仍是内部 runtime state，不进入 chat conversation ThreadState。

**Review Node Must Be Side-effect Free**: PASS。本版不修改 HITL review node 行为。

**Business State and Checkpoint Must Stay Separate**: PASS with guardrail。Conversation Registry 和 chat memory 继续留在 chat-memory runtime/checkpoint 边界，不引入 Prisma ChatSession/ChatMessage business tables。

**Stream Compatibility Is a Hard Constraint**: PASS。方案不新增或修改 stream chunks。streaming guard 是 UI/runtime ownership 规则，不是 protocol 改动。

**Public DTO Must Be Strict and Safe**: PASS with guardrail。registry 与 hydration DTO 必须采用严格 allowlist，且排除 raw checkpoint/session/runtime/provider internals。

**Minimal Abstraction**: PASS with guardrail。只在现有 chat memory 外围增加一层聚焦的 registry/thread-id 边界，不扩展成通用 history 或 memory platform。

**Tests Before Broad Integration**: PASS。先做 registry / thread-id / schema / route contracts，再接 frontend wiring，最后做 non-regression。

**Spec Drift Must Be Blocked**: PASS。后续如果 API contract、public DTO、stream protocol、ThreadState schema、GraphState、Prisma schema 或版本边界发生变化，必须同步更新 spec / plan。

**Official Spec Kit Skills Are Tooling Entry**: PASS。本文档仍位于 `specs/` 下，并沿用 official Spec Kit 流程。

**Spec Kit Language Policy**: PASS。文件名、核心结构和技术名词保留英文，正文解释优先使用中文。

## Project Structure

### Documentation (this feature)

```text
specs/044-multi-thread-chat-sessions/
|- spec.md
|- plan.md
|- research.md
|- data-model.md
|- quickstart.md
|- contracts/
|  |- conversation-registry.md
|  `- chat-thread-hydration.md
`- tasks.md
```

### Source Code (repository root)

```text
apps/webapp/
|- app/api/chat/
|  |- route.ts
|  |- thread/route.ts
|  `- conversations/
|- components/instamind/
|  |- instantmind-page.tsx
|  |- use-chat-stream.ts
|  `- conversation-session/
|- components/ui/
|- lib/ai/
|  |- chat-schema.ts
|  `- runtime/
|     |- chat-orchestrator.ts
|     `- chat-memory/
|        |- chat-memory-service.ts
|        |- hydration-dto.ts
|        |- state-schema.ts
|        |- thread-id.ts
|        `- conversation-registry.ts
`- tests/

packages/stream-core/
`- tests/

packages/database/
`- prisma/
```

**Structure Decision**: v0.4.4 主要仍然落在 `apps/webapp`，因为它本质上是 webapp chat-memory/runtime/UI 能力扩展。`packages/stream-core` 与 `packages/database` 主要承担 non-regression 验证，不应在本版中被顺手扩张范围。UI 层继续站在当前 `instant-mind` 聊天页和本地 `components/ui` 基线上演进，而不是切到 landing 页视觉或增加 MCP 拉组件的额外依赖链。

## Phase 0 Research Summary

详细决策记录见 [research.md](./research.md)。

本阶段确认的关键结论：

- 把有上限的 Conversation Registry 放在 chat-memory runtime/checkpoint 边界，而不是 Prisma business history tables
- 使用新的 conversation-scoped chat memory thread namespace，不兼容 legacy `chat:${sessionHash}`
- ThreadState 继续保持 text-only，不改 state shape
- recent conversations 只收纳 persisted conversations，按 last active time 排序与裁剪，最多保留 10 条
- active persisted conversation 以 server-validated selection 为准；blank draft 可以由 client-local sentinel 表达，但不进入 server registry
- 点击“新聊天”进入 blank draft；首条 user message 才 promotion 为正式 persisted conversation
- streaming guard 留在 UI/runtime ownership 逻辑中，不改 stream-core
- Tasklist 与 Delivery 的 runtime semantics 保持不变，只把最终用户可见文本写入 selected conversation memory

## Phase 1 Design Summary

详细模型与 contracts 见以下文档：

- [data-model.md](./data-model.md)
- [contracts/conversation-registry.md](./contracts/conversation-registry.md)
- [contracts/chat-thread-hydration.md](./contracts/chat-thread-hydration.md)
- [quickstart.md](./quickstart.md)

## UI Convergence Addendum

基于本轮 `shadcn` MCP review，v0.4.4 的 UI 收敛策略补充如下：

- 继续保留 feature-owned business wrappers，如 `ConversationSidebar`、`ConversationMobileSelector`、hydration state 和 review panel；但它们内部的展示层优先改为本地 `shadcn/ui` primitive 组合。
- 优先补齐并使用本地 `ui/sidebar.tsx`、`ui/scroll-area.tsx`、`ui/skeleton.tsx`；必要时把轻量错误态统一到本地 `ui/alert.tsx`。
- 不直接搬运官方 `sidebar-*` block 的整套导航/项目/用户菜单；这些 block 只作为结构参考，避免把 v0.4.4 扩张成完整应用导航系统。
- 桌面 `ConversationSidebar` 可以重构为基于本地 `Sidebar` primitive 的业务壳；移动端 selector 继续保留 `Sheet` 作为左侧抽屉交互，只把内部列表容器等局部区域收敛到合适 primitive。
- hydration skeleton 这类纯展示占位优先用本地 `Skeleton`；recent list 与长内容滚动区优先用本地 `ScrollArea`；错误态优先用本地 `Alert`。
- 所有收敛必须保持当前 `instant-mind` 主题 token、AI Mind 品牌区、sidebar 宽度逻辑、draft-first 会话语义和 streaming guard 不变。

## Post-Design Constitution Re-check

**Controlled Agent First**: PASS。设计没有新增 Agent authority。

**GraphState Is Runtime Source of Truth**: PASS。conversation memory 与 Tasklist GraphState、runtime traces 继续分离。

**Review Node Must Be Side-effect Free**: PASS。没有引入 review node side effects。

**Business State and Checkpoint Must Stay Separate**: PASS。没有 ChatSession/ChatMessage business tables；registry 仍然属于 runtime memory state。

**Stream Compatibility Is a Hard Constraint**: PASS。没有 stream-core union change。

**Public DTO Must Be Strict and Safe**: PASS。contracts 使用 public allowlist，并明确禁止 raw internals。

**Minimal Abstraction**: PASS。设计只增加聚焦的 registry 与 thread-id 边界。

**Tests Before Broad Integration**: PASS。quickstart 先从 contract/state tests 开始，再到 UI smoke。

**Spec Drift Must Be Blocked**: PASS。contracts 与 scope 已对齐澄清后的 spec 决策。

**Official Spec Kit Skills Are Tooling Entry**: PASS。生成产物都位于 `specs/044-multi-thread-chat-sessions/`。

**Spec Kit Language Policy**: PASS。结构英文、正文中文、技术标识英文的规则已经落实。

## Complexity Tracking

当前没有需要单独记录的 constitution violation。
