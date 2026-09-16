# Contract: Runtime Performance And Durable Stream Backpressure

## Purpose

本契约把 v0.6.0 的 B 平衡性能方案固定为可验证边界：通用 ReAct Agent 继续运行在现有 Next.js/Node.js 进程中，I/O 使用异步并发，StreamEvent 以 PostgreSQL 为 durable source of truth，并通过有界微批量和背压避免单个慢数据库或高频 token 流拖垮进程。Action Phase 文本不投影；同模型未绑定 Tool 的 Answer Phase 才产生真实最终 token 流。该设计不改变 180 秒 Run、145 秒 Action cutoff、9 次逻辑 Tool Call、4 次 Run 级 Tool retry、单 Run Tool 并发 3 等既有预算。

## Process Capacity Contract

- 每个 Node.js 进程最多同时执行 8 个 `routeType=chat` General ReAct Run；Tasklist Agent、Delivery Chain 和 Image Agent 不计入该 gate，继续受各自 Runtime 治理。
- `GeneralReActExecutionGate` 是进程级 singleton，只保存 active permit 计数，不保存 user、session、prompt、message、Tool input/output、secret 或其他 request-scoped data。
- admission 必须在确定性上下文准备和 provider 调用前完成。无 permit 时复用现有 `STREAM_SERVICE_UNAVAILABLE`，设置 `retryable=true` 并显示固定“服务繁忙，请稍后重试。”；不建立进程内等待队列，也不消耗模型或 Tool 配额，不向前端展示内部 active/capacity 数值。
- permit 在 Run 终态投影、projection drain 和资源清理完成后的 `finally` 中恰好释放一次；客户端 transport disconnect 不释放 permit，因为后端 Run 仍在继续。
- 该上限是 per-process，不是 cluster-global。v0.6.0 不引入 Redis/KV、分布式 semaphore、跨实例 worker queue 或 executor takeover；多实例部署容量等于各实例容量之和，并必须同时核算 PostgreSQL 总连接数。

## Node.js Event Loop And Worker Contract

- model、Web Search/Extract、MCP、数据库和 stream projection 都属于 I/O-bound 工作，必须使用原生异步 API、awaited promise 和可传播的 `AbortSignal`；General ReAct MCP adapter 还必须关闭 client session recovery，避免 Tool Runtime 之外隐藏 retry。不得使用同步 HTTP、同步文件 I/O、busy wait 或阻塞 sleep。
- v0.6.0 不为这些 I/O 调用创建 `worker_threads`、child process 或每请求 worker。它们不会提高网络 I/O 吞吐，反而增加序列化、生命周期和错误治理成本。
- `calculator`、`datetime` 等本地确定性 Tool 保留在主事件循环，但必须通过输入长度、语法和复杂度上限把同步 CPU 工作约束为短任务；`Promise.race()` 的 timeout 不得被描述为能抢占同步 CPU。
- 参考负载下，本地确定性 Tool 的同步执行 p95 目标不超过 5ms，Node.js event-loop delay p95 目标不超过 50ms。若未来某个 Tool 的受控实现仍持续超过该边界，应把该具体 Tool 迁移到有界共享 worker pool；不得把整个 Agent Run 搬入 Worker。

## PostgreSQL Connection Contract

- v0.6.0 采用 PostgreSQL-first，不引入 Redis。所有可回放 public stream event 必须先持久化成功，再向仍连接的 writer 投递。
- `@ai-mind/database` 必须在开发和生产环境都为每个 Node.js 进程复用一个 Prisma/`PrismaPg` client；不得按请求或按事件创建/销毁 client 或连接池。
- 默认每进程 PostgreSQL pool `max=10`、`connectionTimeoutMillis=5000`、`idleTimeoutMillis=30000`；不得在单个请求结束时 `$disconnect()`。多实例部署的理论连接上限按 `instanceCount × 10` 计算并与数据库 `max_connections` 对齐。
- StreamEvent batch transaction 的 pool wait 上限为 `min(2000ms, Run 剩余时间)`，transaction timeout 为 `min(5000ms, Run 剩余时间)`；它们只约束 durable projection，不替代 Tool attempt timeout。Answer Phase 必须在既有 5 秒 lifecycle reserve 前停止产生新文本，把最后一次 terminal projection 留在 180 秒后端边界内。
- production-like reference load 下，StreamEvent batch append 数据库事务 p95 必须不超过 20ms，作为 release hard gate；基准必须先完成预热，再以记录的并发、样本数、pool 和数据库实例进行测量。开发机 Docker 冷启动只可记录为诊断，不能作为达标证据。若目标环境持续超过该值，先检查数据库、索引、锁等待和实例/连接预算；不能通过丢事件、放宽目标或未证明的 window/pool 改动换取表面吞吐。

## Durable Projection Microbatch Contract

`DurableStreamProjectionBuffer` 是 run-local、可取消、有界的投影队列。它只缓冲已通过 public DTO/schema/secret 检查的事件，不持有 raw LangChain state、raw Tool output、网页正文或 secret。

### Text Delta Rules

1. 每个最终回答 part 的首个 `text-delta` 立即形成持久化批次并在提交成功后投递，避免增加 first-visible-text latency。
2. 后续同一 `runId + messageId + partId + type` 的连续 `text-delta` 在服务端合并；从首个 pending delta 起达到 40ms，或累计达到 256 chars，任一条件先满足即 flush。
3. `256 chars` 是提前 flush 阈值，不是 provider chunk 的拆分上限。若单个 provider delta 已超过 256 chars，必须整块立即 flush，不得为了模拟打字机效果切片或人为延迟。
4. 不同 message/part/type 不得互相合并。General ReAct 不公开 raw reasoning delta；若共享 sink 接收其他现有链路的 reasoning part，也必须保持独立 key 和既有公开策略。

### Structural And Terminal Rules

- `text-start`、`text-end`、Tool/Trace/Resource/Skill/Prompt lifecycle、source update、error、finish、cancel 和 terminal event 到达时，必须先 flush 更早的 pending text，再立即投影结构化事件。
- pending text 与紧随其后的结构化事件可以在同一个数据库 batch transaction 中提交，但必须保留独立 envelope、连续 sequence 和原始语义顺序。
- `StreamEventStore.appendEvents()` 必须对一个 batch 只锁定一次 StreamRun、分配连续 sequence、批量插入事件、更新一次 StreamRun 并执行至多一次 trim；terminal event 必须是 batch 最后一项，terminal 后不得追加事件。
- 数据库事务成功后，envelope 才能按 sequence 投递给 writer；事务失败不得把未持久化事件推给浏览器。writer 已关闭时跳过网络投递，但保留已提交事件供 cursor replay。

## Backpressure Contract

- 每个 Run 最多保留 64 个尚未持久化的 projection items 或 256KiB 序列化 pending bytes，任一上限先达到即进入高水位背压。这个 pending queue 限额与现有单个 StreamEvent payload 上限 `maxEventPayloadBytes=256KiB` 是两个不同边界。
- General ReAct stream adapter 必须 await 可背压的 `publish()`/`flush()` 边界。达到高水位时暂停继续拉取 Agent stream，直到队列低于 32 items 且 128KiB 的低水位，或发生取消、deadline、projection failure。
- 队列不得静默丢弃、覆盖或乱序事件；projection failure 必须固定 Run failure、取消尚未开始的新 model/tool 工作并走现有标准化错误收口。取消或 hard deadline 必须唤醒等待中的 producer，并在 `finally` 清除 timer、listener、pending promise 和 permit。
- projection queue、timer、writer 与 Abort listener 都是 run-local；不得放入可被其他请求读取的 module-level mutable state。

## Browser Rendering Contract

- 浏览器端最终回答 `text-delta` 继续由现有 ref-backed buffer 合并，默认采用 20ms timer 后进入最近一次 `requestAnimationFrame`；仅已评估 token 粒度与 Markdown 成本的模型可通过受控 allowlist 覆盖 timer 窗口，buffer 的临时 map、timer 和 rAF handle 不进入 React state。
- 服务端 40ms 微批通常把默认输入频率限制在约 25 batch/s，因此前端默认 20ms 不代表每秒固定触发 50 次 React 更新；它只吸收重连/网络 burst 并把提交靠近浏览器帧边界。模型覆盖仍必须经对应性能验证。
- code fence 可保留提前到最近 rAF 的现有规则；`text-end`、error、finish、abort 和组件卸载必须同步 flush 或清理，避免尾字符丢失。
- 前端 buffer 不对服务端已合并的大 delta 再做人工逐字切分。最终回答继续使用现有增量 Markdown 渲染，Trace 结构化状态保持即时、稳定 ordinal 更新。

## Observability And Reference Load

允许记录不含用户内容的聚合指标：active General ReAct Run 数、capacity rejection 数、projection queue items/bytes high-water、batch event 数、batch text chars、batch wait duration、append transaction duration、writer disconnected count、event-loop delay、Tool/model duration 和 stop reason。进程级 percentile 只从最近 1,024 个数值样本计算，累计 count/total 不保留原始样本。

实施验收的 reference load 使用 scripted/fake model 与 Tool，不依赖任一外部 Web provider 的稳定性：

- 设置 `AI_MIND_REFERENCE_LOAD_GATE=production-like` 时，必须同时提供非秘密的 `AI_MIND_REFERENCE_LOAD_TOPOLOGY` 与 `AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE`；基准输出必须记录这两个标签、并发数、`prismaPoolConfig`、预热连接数、预热完成状态和 transaction 样本数。缺少任一标签即拒绝作为 production-like 运行。

- 8 个并发 General ReAct Run 持续输出最终文本；
- 每个 Run 允许单批最多 3 个普通 Tool，并证明既有单 Run 并发/预算不被 process gate 改写；
- 第 9 个同时到达的 General ReAct Run 在 admission 前获得标准化 busy 结果，且没有 provider/Tool 调用；
- 连续 token 场景下首个 delta 立即，后续 batch 满足 40ms 或 256 chars flush，未出现未持久化先投递、事件丢失、sequence gap 或 terminal 后追加；
- queue 永不超过 64 items/256KiB，DB 变慢时 producer 被背压，取消/deadline 后所有 timer/listener/permit 可回收；
- production-like PostgreSQL 环境在预热后必须验证 append transaction p95 不超过 20ms，event-loop delay p95 目标不超过 50ms；前端正常持续文本的消息树提交频率通常不超过服务端约 25 batch/s。开发机冷启动会输出诊断指标，但不通过或豁免此 release gate。

这些数值是 v0.6.0 的固定默认值。调整它们必须同步本契约、`spec.md`、`plan.md`、`data-model.md` 和验证场景；不能在 Tool、provider 或前端内部放置互相竞争的隐藏配置。
