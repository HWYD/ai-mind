# Implementation Plan: AI Mind v0.4.7 Browser-local Chat Session Persistence

**Branch**: `[047-browser-local-chat-persistence]` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/047-browser-local-chat-persistence/spec.md`

## Summary

本版本在不新增 PG 完整聊天历史、账号体系或跨设备同步的前提下，为 AI Mind 增加浏览器本地聊天展示持久化。方案把数据职责拆成三层：IndexedDB 中的本地快照负责完整富 UI 历史，现有 Server Conversation Registry 负责会话身份和 ownership，现有 Server ThreadState 负责 AI 短期运行时上下文。

前端恢复采用 local-first：先恢复本地快照展示，再请求服务端确认会话和 ThreadState。服务端 hydration 只作为运行时确认或没有本地快照时的 bounded 降级展示，不能覆盖、补写或合并本地完整历史。持久化只发生在稳定完成态；失败、中止、流式半成品和 pending `AgentInterrupt` 不提交。

## Technical Context

**Language/Version**: TypeScript 5.9.3、React 19.2.4、Next.js 16.1.6

**Primary Dependencies**: 原生 IndexedDB、Zod 4.3.6、现有 React hooks、`@ai-mind/stream-core`、Vitest 4.1.4、Testing Library、jsdom

**Storage**: 浏览器 IndexedDB 保存本地索引和富 UI 快照；现有 Postgres checkpoint 继续保存 Conversation Registry 与 bounded ThreadState；不新增 PG chat-history business table

**Testing**: `pnpm --dir apps/webapp test` / Vitest、Testing Library、jsdom；补充 webapp typecheck、lint 和浏览器 smoke

**Target Platform**: Next.js webapp 的现代浏览器客户端与现有 Node.js API route；本地持久化依赖浏览器 IndexedDB 能力

**Project Type**: Web application with server API and client-side chat runtime

**Performance Goals**:

- 本地快照读写异步执行，不阻塞 `/api/chat` 请求和流式 chunk 消费。
- 正常情况下刷新后优先恢复本地展示；服务端校验在后台完成，不因持久化写入等待拖慢聊天主链。
- 本地容量不足时按完整消息裁剪，不进行无限历史保留承诺。
- 本版不设置本地 IndexedDB 读写的毫秒级 release 阈值；验证重点是本地读写、裁剪、校验或失败不会阻断 `/api/chat` 主请求、stream chunk 消费或现有服务端聊天路径。

**Constraints**:

- 最近会话最多 10 条；draft 不占用 persisted conversation 名额。
- 只保存稳定用户可见 UI；不保存 raw checkpoint、GraphState、session cookie、API key、provider config 或 raw runtime error。
- 本地 UI 历史和服务端 ThreadState 不做完整合并；继续发送时使用服务端 ThreadState。
- 本地存储不可用时，聊天主请求必须继续工作；服务端不可用但本地快照存在时只能只读展示。
- 不修改 shared stream protocol，不新增账号、跨设备同步、PG 完整历史或历史管理 UI。

**Scale/Scope**: 当前 browser user environment 内最多 10 个 persisted conversations；每个会话的快照受浏览器本地容量约束，超限从最旧完整消息开始裁剪。只覆盖 AI Mind 现有普通聊天、tool-assisted chat、Tasklist 和 Delivery 的稳定用户可见展示。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Initial Gate Assessment

| Constitution Principle                           | Assessment | Plan response                                                                                          |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| Controlled Agent First                           | PASS       | 不新增 Agent 能力，不改变 Agent 权限、暂停或恢复边界。                                                 |
| GraphState Is Runtime Source of Truth            | PASS       | 本地快照只服务 UI 展示，不写入或替代 GraphState。                                                      |
| Review Node Must Be Side-effect Free             | PASS       | 不修改 review node；pending `AgentInterrupt` 不进入本地可恢复快照。                                    |
| Business State and Checkpoint Must Stay Separate | PASS       | IndexedDB 是浏览器 UI 缓存；PG checkpoint 继续承担 Registry/ThreadState，不引入 Prisma history table。 |
| Stream Compatibility Is a Hard Constraint        | PASS       | 不新增或修改 `@ai-mind/stream-core` chunk；持久化挂在前端稳定状态边界。                                |
| Public DTO Must Be Strict and Safe               | PASS       | 本地快照使用严格版本 schema；thread route 错误使用安全 code，不输出 raw error/checkpoint。             |
| Minimal Abstraction                              | PASS       | 仅新增真实共享边界：本地存储、稳定消息投影和恢复状态；不引入通用 persistence framework。               |
| Tests Before Broad Integration                   | PASS       | 先测 schema/store，再测 hooks、route 和 UI，最后跑 typecheck/lint/smoke。                              |
| Spec Drift Must Be Blocked                       | PASS       | 同步 spec、plan、research、data model、contracts、quickstart；无协议和数据库 schema 漂移。             |
| Spec Kit Language Policy                         | PASS       | 文件名和 section 骨架保持英文，正文尽量中文，代码标识符和技术名词保持英文。                            |

**Gate result**: PASS。没有需要写入 Complexity Tracking 的 constitution violation。

## Design Decisions

### 1. Browser-local persistence boundary

新增一个位于 `components/instamind/` 下的本地持久化模块，封装 IndexedDB 数据库打开、schema 校验、按会话读取/写入、索引合并、版本判断、容量裁剪和安全清理。该模块只输出浏览器 UI 所需的受控快照，不向服务端或 stream protocol 暴露内部存储结构。

### 2. Local-first recovery flow

`useConversationSessions` 首先尝试读取本地索引，服务端 Registry 成功后再以服务器元数据校正最近会话列表、selected id 和 prune 结果。若 Registry 失败且本地索引有效，保留本地列表并进入 read-only cache；没有本地索引时保留现有空/错误状态。

`useChatStream` 在会话切换时先读取该会话本地快照；然后请求 `/api/chat/thread` 做 Registry/ThreadState 确认。已有本地快照不被 bounded hydration 替换；没有本地快照时才允许显示有限的 server fallback。

### 3. Stable snapshot projection

在 `useChatStream` 的稳定状态边界生成可恢复快照：

- 只接受未设置或 `completed` 的 user/assistant message。
- 过滤 pending/resuming/streaming/failed 的消息和控制部件。
- 过滤 `thread-memory-status` 与 `AgentInterrupt` 控制 payload；保留稳定 tool/resource/skill/workflow/Agent trace/artifact 展示。
- 在普通完成、删除问答、重新生成完成后提交；streaming 中不写入。
- 写入失败只记录可诊断状态，不抛入聊天请求。

### 4. Server boundary adjustment

保持 `/api/chat/conversations` 和 `/api/chat` 的现有业务边界；仅调整 `/api/chat/thread` 对 ThreadState 读取失败的响应，让前端能够区分空的 bounded state 与服务端不可用，并进入只读缓存。成功 DTO 仍是严格 `ThreadHydrationDTO`，不会升级为完整 transcript。

### 5. Concurrency

本地 IndexedDB 以 `conversationId` 作为 snapshot key。不同会话更新互不覆盖；索引更新按会话 ID 合并，避免一个标签页写入会话 A 时丢失另一个标签页刚写入的会话 B 元数据。`selectedConversationId` 和 draft hint 只作为浏览器 UI hint，按索引 revision 保留最后一次稳定写入，不影响各会话快照本身。相同会话的快照写入带 revision，旧版本不得覆盖新版本，不做消息级冲突合并，也不承诺跨标签页实时同步。

### 6. Server-authoritative registry reconciliation

The browser still uses a local-first render path so refresh can restore the previous local list immediately. The subsequent valid `GET /api/chat/conversations` response is the authority for the local conversation index because the project has no account identity or cross-device ownership guarantee. Reconciliation therefore uses two explicit write modes:

- ordinary local writes merge metadata by `conversationId` and preserve independent writes from other tabs;
- server-authoritative reconciliation replaces the observed baseline with server metadata, hard-deletes baseline local-only IDs and snapshots, and preserves only entries created by another tab after the request baseline.

The complete user-visible conversation snapshot is never compared with or replaced by server registry metadata or bounded `ThreadState`. A matching ID updates list metadata only. Failed, timed-out or invalid registry responses do not perform cleanup and leave the local cache available for read-only fallback.

### 7. Reconciliation implementation sequence

1. Add a store-level authoritative reconciliation operation without changing the existing ordinary merge API.
2. Capture the local index baseline before the registry request and pass it to reconciliation.
3. On a valid response, write the authoritative index first, then delete snapshots only for baseline IDs absent from the server list.
4. Add focused store and hook tests for valid replacement, empty valid response, same-ID snapshot preservation, concurrent different-tab writes, and failed/invalid response preservation.
5. Update acceptance evidence and run targeted tests, typecheck, lint and diff checks.

## Project Structure

### Documentation (this feature)

```text
specs/047-browser-local-chat-persistence/
├── plan.md                 # 本文件
├── research.md             # Phase 0 决策和现状研究
├── data-model.md           # 本地索引、快照和生命周期
├── quickstart.md           # 自动化与手工验证路径
├── contracts/
│   ├── local-chat-store.md # IndexedDB 本地存储契约
│   └── server-chat-boundary.md # 现有 API 边界和错误契约
└── tasks.md                # Phase 2，由 /speckit-tasks 生成
```

### Source Code (repository root)

```text
apps/webapp/
├── app/api/chat/
│   ├── conversations/route.ts # 保持 Registry metadata contract
│   └── thread/route.ts        # 区分 empty hydration 与 ThreadState unavailable
├── components/instamind/
│   ├── local-chat-persistence/
│   │   ├── schema.ts           # 版本化本地 DTO / Zod validation
│   │   ├── store.ts            # IndexedDB CRUD、索引合并、revision、quota fallback
│   │   └── stable-snapshot.ts  # MindMessage -> recoverable snapshot projection
│   ├── conversation-session/
│   │   └── use-conversation-sessions.ts # local-first list、server reconcile、read-only state
│   ├── use-chat-stream.ts      # local-first message hydration 和 stable snapshot commit
│   └── instantmind-page.tsx    # read-only cache indicator 与交互禁用
    └── tests/
        ├── app/api/chat/thread/route.test.ts
        ├── app/instant-mind/page.test.ts
        └── components/instamind/
            ├── local-chat-persistence.test.ts
            ├── conversation-session.test.tsx
            └── use-chat-stream-hydration.test.tsx
```

**Structure Decision**: 选择现有 Next.js webapp 的前端模块和 API route 结构，不新增 package、server service 或 database schema。持久化模块放在 `components/instamind/local-chat-persistence/`，因为它同时被会话列表和聊天流 hook 使用，并且其职责是浏览器 UI 状态而非服务端 runtime。

## Implementation Phases

### Phase 0：Research and boundary confirmation

- 已完成现状读取：确认 localStorage 目前只保存 selected/draft hint，`useChatStream` 当前以 server bounded hydration 初始化消息，PG checkpoint 只保存 Registry/ThreadState。
- 已完成决策：IndexedDB、本地优先恢复、稳定快照过滤、按会话隔离并发、显式 ThreadState unavailable 错误。
- 输出：`research.md`。

### Phase 1：Data model and contracts

- 定义本地索引、快照、可恢复消息和版本化 schema。
- 定义 IndexedDB store 的读写结果、容量裁剪、版本覆盖和安全字段边界。
- 定义 `/api/chat/thread` 的错误语义及 `/api/chat` 不变边界。
- 输出：`data-model.md`、`contracts/`、`quickstart.md`。

### Phase 2：Implementation sequencing for `/speckit-tasks`

1. 先实现 schema、stable message projection 和 IndexedDB store，并覆盖 invalid/quota/revision/不同 conversationId 隔离测试。
2. 扩展 `useConversationSessions`：本地索引恢复、server reconcile、prune 清理、read-only cache 状态和现有 localStorage hint 兼容。
3. 扩展 `useChatStream`：本地快照优先、bounded server fallback、稳定完成态写入、删除/重新生成写入、draft promotion 和失败/中止不覆盖。
4. 调整 `thread/route.ts` 的 ThreadState unavailable public error，并补 route contract tests；保持 chat route 和 stream protocol 兼容。
5. 更新 `instantmind-page.tsx` 的只读提示、显式重试 CTA、发送/新建/切换禁用和可访问性语义，复用现有 shadcn `Alert` / `Button` 风格。
6. 补齐 conversation、hydration、UI failure、browser restart、multi-tab smoke、Tasklist 和 Delivery 非回归场景。
7. 按 constitution 顺序执行 targeted tests、route tests、page tests、Tasklist/Delivery non-regression、typecheck、lint 和 browser smoke。

## Risks and Mitigations

| Risk                                     | Mitigation                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| IndexedDB quota 或浏览器策略导致写入失败 | 旧消息完整裁剪后重试；仍失败则静默降级，不影响 `/api/chat`。                                        |
| 本地 UI 与 ThreadState 上下文不同步      | 明确本地只负责展示、服务端只负责 AI 上下文；不做静默合并，并在 spec/contract 中固定边界。           |
| server thread 失败被误判为空状态         | `/api/chat/thread` 返回显式 `CHAT_THREAD_HYDRATION_UNAVAILABLE`，前端进入只读缓存。                 |
| 多标签页覆盖本地历史                     | snapshot 按 `conversationId` 分离；同会话使用 revision，索引按会话 ID 合并。                        |
| 富 UI 快照包含不安全或不可恢复字段       | 只从稳定 `MindMessage` 投影到严格 schema；排除 raw runtime、pending interrupt 和 transient status。 |
| 持久化逻辑侵入 stream 主链               | 写入异步、失败隔离；不修改 stream-core，不把 IndexedDB 错误抛入生成请求。                           |

## Verification Strategy

1. Contract/schema：本地 DTO、版本、过滤、字段白名单、IndexedDB result handling。
2. Persistence integration：跨刷新/重启语义、容量裁剪、quota fallback、不同/同一会话并发。
3. Hook behavior：local-first hydration、server reconcile、read-only fallback、stable writes、delete/regenerate。
4. Route/API：Registry 404、ThreadState unavailable 5xx、success DTO 和 `/api/chat` compatibility。
5. UI：只读提示、显式 retry CTA、发送/新建/切换禁用、可访问性语义和富 UI 展示不被清空。
6. Non-regression：Tasklist checkpoint/resume 和 Delivery run-local 语义不因本地 UI 快照恢复改变。
7. Repository checks：`pnpm --dir apps/webapp typecheck`、`pnpm lint:webapp`、targeted Vitest、浏览器 smoke。

## Constitution Re-check After Design

**Result**: PASS。

- 设计没有新增 Agent、GraphState、Prisma business state 或 stream protocol 字段。
- IndexedDB 与 PG checkpoint 的职责保持分离；本地快照不会成为 server authority 或 model context source。
- API 错误使用安全 code 和严格 DTO；不透传 raw runtime 数据。
- 新增抽象仅服务真实的浏览器存储边界、稳定状态过滤和跨 hook 复用。
- 测试顺序遵循 schema/storage → route/hook → UI → typecheck/lint/smoke。

### 8. Conversation deletion boundary

会话删除沿用当前 `Conversation Registry` 与 `chat-memory` 分层，不新增聊天历史业务表：

1. `/api/chat/conversations` 新增严格 JSON `DELETE` 请求，仅接受 `conversationId`。
2. `ConversationRegistryService.deleteConversation` 先校验当前 browser session ownership，再通过 `ChatMemoryService.deleteThreadState` 清理 `buildChatConversationThreadId(sessionId, conversationId)` 对应的 checkpoint ThreadState，最后写入移除该 ID 的 Registry。
3. 服务端只有在两个删除步骤均完成后才返回新的 Registry payload；客户端复用既有 server-authoritative reconciliation，成功后删除本地 index entry 和 UI snapshot，失败时保留本地数据并显示可恢复错误。
4. 删除当前会话时使用服务端返回的 fallback selected conversation；删除最后一个会话时进入空白 draft。删除非当前会话不改变当前展示。
5. 桌面端和移动端共用 destructive confirmation 语义；桌面端 action 在 hover/focus 时可见，移动端 action 始终可触达。菜单只提供 Delete，不扩展通用历史管理能力。

跨 Registry checkpoint 与 conversation ThreadState 的删除不存在数据库级事务，因此实现顺序优先保护 ThreadState 清理；任一步失败都不触发客户端本地清理，并通过 API 错误让用户重试。

## Complexity Tracking

无 constitution violation，不需要额外复杂度豁免。
