# Quickstart: AI Mind v0.4.7 本地聊天持久化验证

## Prerequisites

- Node.js 与仓库要求的 `pnpm@10.18.3`。
- 已安装 workspace dependencies。
- 需要验证服务端会话恢复时，准备现有 webapp 的 session cookie 和 chat-memory checkpoint 环境；不需要新增数据库表。

## Automated Validation

在仓库根目录执行：

```powershell
pnpm --dir apps/webapp test -- tests/components/instamind/local-chat-persistence.test.ts
pnpm --dir apps/webapp test -- tests/components/instamind/conversation-session.test.tsx tests/components/instamind/use-chat-stream-hydration.test.tsx
pnpm --dir apps/webapp test -- tests/app/instant-mind/page.test.ts
pnpm --dir apps/webapp test -- tests/app/api/chat/thread/route.test.ts
pnpm --dir apps/webapp test -- tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts tests/lib/ai/runtime/delivery-chain.test.ts
pnpm --dir apps/webapp typecheck
pnpm lint:webapp
```

预期结果：

- 本地 schema、IndexedDB store、容量裁剪和版本覆盖测试通过。
- 会话列表能从本地索引恢复，并在 Registry 成功后同步服务端元数据。
- `useChatStream` 优先恢复本地富 UI 快照，不被 bounded hydration 清空。
- ThreadState 不可用时进入只读缓存；本地存储失败不阻断 `/api/chat`。
- 只读缓存提示、发送/新建/切换禁用和重试入口 UI 测试通过。
- Tasklist checkpoint/resume 与 Delivery run-local 非回归测试通过。
- route error contract、TypeScript 和 lint 通过。

## Manual Smoke Scenarios

7. **桌面端删除**：鼠标悬浮或键盘聚焦最近会话行，打开右侧三点菜单；菜单只显示 Delete，取消确认不改变列表和消息，确认后目标会话从服务端 Registry、ThreadState 和本地列表消失。
8. **移动端删除**：打开会话抽屉，在目标行直接触达三点 action；不依赖 hover，确认弹窗显示会话标题；取消、关闭和服务端失败均保留本地会话，成功后按服务端 fallback 切换或进入 draft。
9. **删除失败恢复**：让 DELETE 请求返回 5xx，确认行和本地 UI snapshot 仍在，显示可重试错误；恢复服务端后再次确认删除。

10. **普通刷新和浏览器重启**：创建至少两个会话，各发送一轮稳定消息；刷新页面并重启浏览器，确认最近列表、selected conversation、标题和消息均恢复。
11. **富 UI 展示**：产生 tool/resource/skill/workflow/Agent trace/artifact 等已完成展示，刷新后确认仍在原会话显示；确认 bounded server hydration 不会清空本地展示。
12. **删除与重新生成**：删除一轮问答、重新生成最后一轮，等待稳定后刷新；确认旧消息不恢复，最新稳定状态存在。
13. **失败与中止**：在 assistant streaming、请求失败或用户中止期间刷新；确认半成品、失败回合和 pending `AgentInterrupt` 不作为已完成历史恢复。
14. **本地只读降级**：保留有效本地快照，模拟 Registry 或 ThreadState 请求失败；确认本地消息可见、出现明确只读提示，发送、新建和切换均禁用，并且“重试连接服务端”入口可重新触发恢复。
15. **本地存储失败**：禁用或模拟 IndexedDB 写入失败；确认聊天请求仍可完成，页面不因本地持久化失败而中断。
16. **会话隔离和并发**：在两个标签页分别更新不同会话，确认快照互不覆盖；在同一会话产生并发更新，确认旧版本不能覆盖新版本，且不发生消息级合并或实时同步承诺。
17. **服务端会话失效**：让本地缓存中的会话被 Registry 判定为无效或 prune；确认不会发送或切换到该会话，并安全清理后回退。

### 9. Server-authoritative list cleanup

Prepare a local index with one conversation that is absent from the server registry and another conversation with a local rich-message snapshot. Refresh the page and observe the local list first. After a valid registry response, verify that the absent conversation is removed from both the local index and snapshot store, while the retained conversation receives server metadata and keeps its complete local message snapshot. Repeat with a valid empty registry response and verify that all baseline local conversations are removed.

Repeat with a rejected request, timeout or invalid registry payload. Verify that no local index row or snapshot is deleted and that the existing read-only cache fallback is shown when a valid local cache exists.

## Fault-injection Note

- 如果当前浏览器验证环境不方便稳定注入 `Conversation Registry` / `ThreadState` 失败，或不方便人为制造同一会话的精确并发写入，优先使用 `tests/components/instamind/conversation-session.test.tsx`、`tests/components/instamind/use-chat-stream-hydration.test.tsx` 与 `tests/components/instamind/local-chat-persistence.test.ts` 作为收口证据。
- 真实浏览器 smoke 仍应至少覆盖“普通刷新恢复”“富 UI 恢复”和“多标签页不同会话互不串线”三类用户可见场景。

## Scope Check

验证过程中不得出现以下新增行为：PG 完整聊天历史表、账号登录、跨设备同步、聊天搜索/分页/导出、stream protocol 新字段或把本地完整历史作为新的模型上下文契约。
