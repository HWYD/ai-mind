# Acceptance 047: Browser-local Chat Session Persistence

**Status**: Accepted
**Version**: v0.4.7
**Date**: 2026-07-15

## Release Gate

- [x] 浏览器本地快照成为完整用户可见聊天展示历史的唯一恢复来源
- [x] Server Conversation Registry 继续作为会话身份、归属、最近会话保留和交互合法性的唯一权威
- [x] Server ThreadState 继续只作为 AI 运行时短期上下文权威，不升级为完整聊天历史
- [x] 页面刷新后可恢复最近会话列表、当前会话选择和当前会话稳定展示内容
- [x] 富 UI 消息展示可在本地恢复后继续保留，不会被 bounded server hydration 静默覆盖
- [x] 本地持久化读写、校验、裁剪或失败不会阻断 `/api/chat` 主请求、stream chunk 消费或现有服务端聊天路径
- [x] 本地快照缺失时，bounded server hydration 只作为降级展示，不宣称恢复了完整历史
- [x] server registry 或 thread recovery 不可用但本地快照存在时，页面进入明确的只读缓存态
- [x] 只读缓存态下禁止发送、新建会话和切换会话
- [x] 已被 server 判定无效、越权或 prune 的本地会话不会恢复为可交互会话
- [x] 不同 `conversationId` 的本地写入互不覆盖；同一会话并发写入遵循较新稳定 revision 覆盖较旧 revision
- [x] v0.4.7 不引入 PG 完整聊天历史表、账号体系、跨设备同步、历史搜索/导出/分享或新的 stream protocol 字段
- [x] 普通 chat、tool-assisted chat、Tasklist、Delivery 现有服务端语义保持兼容

## Acceptance Matrix

| Matrix ID | Scenario                                                                                                        | Evidence                                                        | Covers                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| M1        | 普通文本会话：发送“请用一句话介绍 AI Mind 本地持久化”，刷新后恢复 recent list、selected conversation 与助手回复 | 2026-07-15 真实浏览器 smoke                                     | SC-047-001, SC-047-002, SC-047-008             |
| M2        | 富 UI 会话：运行“受控任务规划”示例并完成 Strategy Review，刷新后恢复 Agent Graph、artifact 文本与 tasklist 正文 | 2026-07-15 真实浏览器 smoke + `resumeAgentRun` 本地快照回归测试 | SC-047-002, SC-047-003, SC-047-008             |
| M3        | 多标签页不同会话：tab1 保持 rich UI 会话，tab2 切到普通文本会话并追加一轮，确认 tab1 未串线、tab2 正常完成      | 2026-07-15 真实浏览器 smoke                                     | SC-047-001, SC-047-008                         |
| M4        | 只读缓存与恢复：Registry / ThreadState 不可用、恢复成功、无本地缓存等 fault-injection 场景                      | focused hook / page / store tests                               | SC-047-004, SC-047-005, SC-047-006, SC-047-009 |
| M5        | 范围守卫：不新增服务端完整历史、账号、跨设备同步或 stream protocol 字段                                         | spec + implementation diff + non-regression suites              | SC-047-007                                     |

| M6 | Server-authoritative list reconciliation: after a valid registry response, baseline local-only IDs and snapshots are removed; retained IDs update metadata without changing local snapshots; failed or invalid responses preserve local data | `local-chat-persistence.test.ts` and `conversation-session.test.tsx` focused tests | SC-047-006, SC-047-010 |
| M7 | 单会话删除：桌面/移动端经过 destructive confirmation 后，服务端同时清理 Registry 与 ThreadState；成功响应驱动本地目标 index/snapshot 删除，失败保留本地数据 | `chat-memory-conversation-registry.test.ts`, `conversations/route.test.ts`, `conversation-session.test.tsx` | SC-047-011, SC-047-012, SC-047-013 |

### Explicit measurable gates for SC-047-001/002/003/008

- SC-047-001 passes when the fixed refresh/restart matrix has one observed result for each of the seeded recent server conversations: the list contains the expected server-retained IDs in server order, with no baseline local-only ID after reconciliation.
- SC-047-002 passes when the selected seeded conversation's local snapshot read returns the same stable user-visible message IDs and content before and after refresh, with zero messages from another conversation.
- SC-047-003 passes when each rich-UI fixture in the matrix retains its declared rich part kinds and stable display content after refresh; the check is fixture-based and does not claim arbitrary UI coverage.
- SC-047-008 passes when the matrix records successful restoration of list, selected ID, title and stable user-visible messages for every seeded case, without manual re-selection or re-entry.

## Functional Acceptance

### Recent Conversation Restore

- [x] 刷新页面后，最近 10 个服务端仍保留的会话可按正确顺序恢复到最近会话列表
- [x] 刷新页面后，刷新前选中的会话会优先恢复；若该会话无效，则回退到安全的有效会话或空白 draft
- [x] 曾点击“新聊天”但尚未发送首条消息时，刷新后恢复为空白 draft，不创建 ghost conversation

### Stable UI Snapshot Restore

- [x] 已完成会话中的稳定 `MindMessage` 可在刷新后恢复到当前会话展示区
- [x] 已完成的 text、reasoning、tool/resource/skill/prompt、workflow progress、Agent trace、artifact 等用户可见稳定 UI 部分可以恢复
- [x] streaming、failed、aborted、pending review、resumable `AgentInterrupt`、瞬时 `thread-memory-status` 等非稳定状态不会作为可恢复完成态写入
- [x] 当前请求失败、被用户中止或只生成半成品 assistant 内容时，不会覆盖上一份成功稳定快照
- [x] 删除问答和重新生成完成后，会以新的稳定 UI 状态更新本地快照，不恢复已删除或已替换内容

### Server-authoritative Interaction

- [x] 本地完整 UI 历史与服务端 ThreadState 不一致时，只要服务端会话归属和 ThreadState 可用，仍允许继续发送
- [x] 继续发送时，AI 仍按服务端 ThreadState 组装上下文，而不是把本地完整 UI 历史提升为模型上下文
- [x] 切换到会话 A 时，只展示会话 A 的本地历史，后续发送也只归属到服务端确认的会话 A

## Failure And Read-only Fallback Acceptance

- [x] 本地快照存在但 server registry 暂时不可用时，页面可只读展示本地最近会话和当前快照，并明确提示“当前未获服务端确认”
- [x] local snapshot 存在但 thread hydration 暂时不可用时，页面进入只读缓存态，并提供可恢复后的重试入口
- [x] 本地存储不可用、损坏、被清理或写入失败时，现有服务端聊天主链继续工作，不因本地持久化异常中断
- [x] 服务端恢复可用后，页面可从只读缓存态回到正常可交互态，不静默切换到无关会话
- [x] 没有有效本地缓存且服务端恢复失败时，页面保持现有安全的 loading / empty / error 路径，不伪造会话

## Concurrency, Capacity And Browser Scope Acceptance

- [x] 不同浏览器标签页同时更新不同会话时，不会发生跨会话写入冲突
- [x] 多个标签页先后为同一会话产生稳定更新时，较新的稳定 revision 覆盖较旧 revision，不做消息级合并
- [x] v0.4.7 不承诺跨标签页实时同步，但该限制不会破坏服务端会话隔离
- [x] 本地存储超过容量边界时，从最旧的完整消息开始裁剪，不能写入半条消息
- [x] 同一浏览器用户环境中重启浏览器后，只要站点数据仍在，可恢复本地快照
- [x] 清除站点数据、更换浏览器环境或缺少本地数据时，系统按“无本地快照”安全路径处理，不承诺找回旧本地历史

## Required Focused Tests

- [x] `apps/webapp/tests/components/instamind/local-chat-persistence.test.ts`
- [x] `apps/webapp/tests/components/instamind/conversation-session.test.tsx`
- [x] `apps/webapp/tests/components/instamind/use-chat-stream-hydration.test.tsx`
- [x] `apps/webapp/tests/app/instant-mind/page.test.ts`
- [x] `apps/webapp/tests/app/api/chat/thread/route.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- [x] `apps/webapp/tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] 与 conversation restore / thread hydration / read-only fallback 直接相关的现有 Instamind 测试更新完毕

## Validation Commands

- [x] `pnpm --dir apps/webapp test -- tests/lib/ai/runtime/chat-memory-conversation-registry.test.ts tests/app/api/chat/conversations/route.test.ts tests/components/instamind/conversation-session.test.tsx`

- [x] `pnpm --dir apps/webapp test -- tests/components/instamind/local-chat-persistence.test.ts tests/components/instamind/conversation-session.test.tsx tests/components/instamind/use-chat-stream-hydration.test.tsx tests/app/instant-mind/page.test.ts tests/app/api/chat/thread/route.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts tests/lib/ai/runtime/delivery-chain.test.ts`
- [x] `pnpm --dir apps/webapp typecheck`
- [x] `pnpm lint:webapp`
- [x] `git diff --check`

## Execution Evidence

- [x] Focused local persistence / session / hydration / page / route / Tasklist / Delivery suites 于 2026-07-15 重新执行：7 files / 59 tests passed。
- [x] 其中 `conversation-session.test.tsx` 当前为 11 passed，`use-chat-stream-hydration.test.tsx` 当前为 7 passed，`page.test.ts` 当前为 6 passed。
- [x] `pnpm --dir apps/webapp typecheck` 于 2026-07-15 passed。
- [x] `pnpm lint:webapp` 于 2026-07-15 passed，保留既有 Fast Refresh warnings（0 errors）。
- [x] `git diff --check` 于 2026-07-15 passed。
- [x] 真实浏览器 smoke 于 2026-07-15 在本地 dev server `http://127.0.0.1:3000/instant-mind` 完成：
    - 普通文本恢复：发送“请用一句话介绍 AI Mind 本地持久化”后刷新，recent list、selected conversation 与助手回复一并恢复。
    - 富 UI 恢复：运行“受控任务规划”示例并点击“按当前策略继续”完成后刷新，`Agent Graph 执行过程`、`v0.3.4 Tasklist`、节点路线与 artifact 正文继续可见。
    - 多标签页隔离：tab1 保持 rich UI 会话；tab2 切到“请用一句话介绍 AI Mind 本地持久化”并追加“请再压缩成 8 个字”得到 `AI思维本地持久`；tab1 当前 rich UI 会话未被串线覆盖。
- [x] fault-injection 类浏览器场景（read-only fallback、服务端恢复、同会话 revision 覆盖）使用 focused tests 作为收口证据，因为这些场景需要可重复的请求失败/并发写入注入，自动化 hook / store suites 比手工操作更稳定、可复验。

### Phase 9 Reconciliation Evidence

- [x] `local-chat-persistence.test.ts` covers authoritative replacement, retained-ID snapshot preservation, baseline cleanup responsibility, and post-baseline concurrent conversation preservation.
- [x] `conversation-session.test.tsx` covers local-first display, valid server replacement and cleanup, plus the rule that failed registry recovery does not reconcile or delete local data.
- [x] The fixed acceptance gates for SC-047-001/002/003/008 are fixture-based: expected IDs, message IDs/content, rich-part kinds and selected/title restoration are checked per seeded case; no unbounded 100% claim is used.
- [x] Phase 9 focused tests: 62 tests passed across 7 files; `pnpm --dir apps/webapp typecheck`, `pnpm lint:webapp` (5 pre-existing warnings, 0 errors) and `git diff --check` passed on 2026-07-15.

### Phase 10 Conversation Deletion Evidence

- [x] `chat-memory-conversation-registry.test.ts`: 13 tests passed; current conversation deletion selects fallback, last conversation becomes empty draft, partial Registry failure is covered, and target ThreadState is unreadable after deletion.
- [x] `conversations/route.test.ts`: 9 tests passed; strict DELETE validation, ownership 404, 500 failure mapping, updated Registry payload and ThreadState cleanup are covered.
- [x] `conversation-session.test.tsx`: 16 tests passed; successful DELETE reconciles local snapshot cleanup, including a target snapshot absent from the local index baseline, failed DELETE preserves local data, desktop/mobile action menus contain only Delete, and cancellation does not call deletion.
- [x] The final seven-file focused suite passed with 63 tests; `pnpm typecheck`, `pnpm lint:webapp` (5 pre-existing warnings, 0 errors) and `git diff --check` passed on 2026-07-15.

## Manual Scope Guardrail

- [x] 不把浏览器本地持久化扩展成服务端完整聊天历史系统
- [x] 不新增 PG 完整 chat-history business table
- [x] 不引入账号体系、跨设备同步或云端历史恢复承诺
- [x] 不把本地完整 UI 历史与服务端 bounded hydration 静默合并成一份“完整官方历史”
- [x] 不修改 `@ai-mind/stream-core` public chunk union
- [x] 不把 raw checkpoint、raw GraphState、raw runtime error、API key、session cookie、provider config 写入本地快照或公开 DTO
- [x] 不改变 Tasklist checkpoint / resume 语义
- [x] 不改变 Delivery run-local 语义
