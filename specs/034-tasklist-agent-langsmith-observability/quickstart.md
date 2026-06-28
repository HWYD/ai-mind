# Quickstart 034：Tasklist Agent LangSmith Observability

状态：已完成
版本：v0.3.4
日期：2026-06-29

> 本 quickstart 是 v0.3.4 实施完成后的验证指南。LangSmith 真实外部服务联通需要在配置真实 API key 后做人工补验。

## 1. 本地开启 LangSmith

在 `apps/webapp/.env.local` 中配置：

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-api-key
LANGSMITH_PROJECT=ai-mind-dev
```

如果没有 API key：

```env
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=ai-mind-dev
```

此时 Tasklist Agent 应正常运行，只是不创建 LangSmith trace。

## 2. 启动本地运行环境

按 v0.3.0 之后的本地数据库流程启动 Postgres，并启动 webapp：

```powershell
docker compose -f deploy/compose.local.yml up -d postgres
pnpm db:migrate:deploy
pnpm db:checkpoint:setup
pnpm dev:webapp
```

## 3. 触发 Tasklist Agent

在 UI 中发送：

```text
/tasklist @docs://versions/<某个版本方案>.md
```

预期：

- Strategy Review HITL 出现。
- LangSmith 中出现 Tasklist Agent trace。
- trace metadata 能看到 `runId`、`threadId`、`assistantMessageId`。

## 4. 验证 HITL decision

任选一种 Strategy Review decision：

- approve
- edit
- reject
- respond

预期：

- LangSmith trace 中只能看到 decision type 和摘要 metadata。
- 不应看到完整用户 feedback。
- 不应看到完整 prompt 或 tasklist markdown。

## 5. 验证 resume

执行 approve / edit / respond 让 graph resume。

预期：

- resume 事件与 initial run 使用同一组 `runId`、`threadId`、`assistantMessageId` 关联。
- final / blocked / rejected / failed 有明确 result metadata。

## 6. 验证 soft fail

将 `LANGSMITH_TRACING=true`，但移除或填错 API key。

预期：

- Tasklist Agent 不报用户可见错误。
- AgentRun 状态仍按业务结果变化。
- stream / artifact 不受影响。

## 7. 验证普通聊天不受影响

发送普通聊天消息。

预期：

- 普通聊天不创建 Tasklist Agent LangSmith trace。
- 普通聊天 stream 行为与 v0.3.3 保持一致。

## 8. Redaction 人工检查

在 LangSmith trace 中人工确认没有以下内容：

- GraphState。
- checkpoint。
- raw provider error。
- API key。
- session cookie。
- full prompt。
- full version plan。
- full user feedback。
- full tasklist markdown。
