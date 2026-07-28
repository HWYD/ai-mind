# Decisions: Resumable Agent Streams

## D-001 固定 envelope 协议

v0.4.10 的成功流统一使用 `ai-mind-resumable-v1` `StreamEventEnvelope`。`Accept` 只作为客户端声明，不再触发 raw chunk fallback。旧客户端必须随完整 webapp 镜像一起迁移。

## D-002 初始 POST 与 recovery GET 分工

初始 `POST /api/chat` 负责创建或复用执行；同一页面生命周期内发生断线时，客户端使用同一 `runId` 和 cursor 访问 recovery GET，不重新执行模型或 Agent。页面刷新、关闭后的活动订阅恢复不属于本版本范围。

## D-003 幂等与重试边界

初始 POST 必须携带稳定的 `Idempotency-Key`。尚未获得 `runId` 时，客户端最多重试 3 次、总预算 20 秒，并复用原 payload；收到 replay descriptor 后只走 GET recovery。外部 Tool/MCP side effect exactly-once 延后处理。

## D-004 执行、业务状态与 checkpoint 分离

`StreamRun`/`StreamEvent` 只负责 transport recovery。AgentRun 继续负责 Agent 业务状态，LangGraph checkpoint 继续负责 runtime state。执行器保持在创建 run 的长生命周期 Node.js process 中，不提供 process-crash takeover 或跨实例执行接管。

## D-005 retention 与取消语义

活动 run 使用至少最近 10 分钟的滚动事件窗口，并受 per-run event count 和 payload size 上限约束；超出恢复窗口必须返回 safe recovery-unavailable/final-state guidance。取消先记录 durable intent，客户端沿用 optimistic stop UI，最终 cancelled terminal 由 active executor 观察取消后投影。
