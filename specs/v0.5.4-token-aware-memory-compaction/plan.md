# Implementation Plan: Token-aware Memory Compaction

**Branch**: `codex/v0.5.4-token-aware-memory-compaction` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/v0.5.4-token-aware-memory-compaction/spec.md`

## Summary

v0.5.4 将普通聊天从固定两轮/四条消息的 compaction 触发方式迁移到模型感知的 token budget。服务端模型目录保存物理 context window；统一 budget policy 再把云端普通聊天限制到 128K、本地 Ollama 限制到 32K，并预留输出和 runtime headroom。Chat Orchestrator 在所有注入 chat memory 的模型调用前组装、计数和拟合完整输入；持久化压缩失败时不破坏 checkpoint，当前请求通过 ephemeral fit 继续执行。Composer 额外通过独立 session-authorized read-only endpoint 显示 persisted chat memory 相对 selected-model effective window 的轻量占用提示。

该变更是 Level D runtime 主链调整，但保持既有公开 API、stream protocol、hydration DTO、ThreadState 字段、数据库职责、GraphState 和前端消费形状不变。主要实现位于既有 model-provider、chat-memory 与 Chat Orchestrator 边界；不建立第二套 context manager，不把数据层或 Provider 细节写入 route。FR-028 的用量 endpoint 是不含正文、token 原数或 Provider config 的独立最小 read model，不修改既有 `GET /api/chat/thread`。

## 2026-09-06 Persistent Scroll Intent Amendment

本节替代此前 semantic terminal-follow、64ms 终态补偿与两帧后转 passive 方案。网络 finish、React 提交和 Virtuoso 测量没有共同完成时刻，列表 total-height 不能证明某一 tail 已测量；持久用户意图消除这种时序猜测。

1. policy 分离 following/reading 意图、历史 initializing/ready 和待执行命令。完成/错误/暂停不改变意图。上翻/滚动条离底/手动展开进入 reading；按钮、用户向下回到真实底部、被接受的新轮次恢复 following。几何变化不能恢复 reading。
2. 保留外部全高 viewport 与浮动 Composer。外部 viewport 显式 overflow-anchor:none，避免浏览器锚定与 Virtuoso 补偿叠加。实测 Composer + 54px 只在 Footer 计算一次。此前把移动选择器与顶部告警放入 Virtuoso Header 的决定由 T054 覆盖：导航在 viewport 外占据固定布局，持续故障回到对应区域，Header 默认留空。
3. 固定 react-virtuoso@4.18.12，followOutput=false。它覆盖部分同项增高，旧“只处理追加”判断错误；但 callback 返回 false 不约束全部尺寸分支，独立子组件延迟增高也无持久保证。策略是唯一决策者；list handle 缓存 totalListHeightChanged，以公共 scrollTo({top: totalHeight, behavior: 'auto'}) 实现到底，库负责 customScrollParent 坐标转换/钳制。
4. 单个事件驱动 rAF 合并内容、总高、viewport/composer 变化和显式请求，执行前重验展示代次/意图/entry/bottom，不自旋。交互跟随不用有内部重试的 scrollToIndex；历史首次挂载保留 initialTopMostItemIndex。所有交互统一 auto。
5. 会话层拥有 presentationKey：新建/真实切换改变，draft promotion 和 registry 对账保持。列表/折叠/观测用展示身份隔离；清理不依赖 stream status。
6. hints 仅可阻塞历史首次 bootstrap，沿用 500ms 上限。一旦列表挂载，promotion/宽度变化/未命中回退结构估算，不再 return null 或显示 skeleton。
7. accepted-turn 信号在 send/regenerate/resume 拒绝条件后发出；不能在尝试发送时重置或等待完整流 Promise；重连不算新轮次。保留 completion revision 给 memory usage，删除滚动 TerminalTail handshake。
8. 手动展开通过用户事件在高度改变前退出跟随；自动展开/收起不误判。向下回底要有实际用户滚动证据，缩短内容或扩大窗口本身不恢复。End/PageDown/触摸惯性保留跨帧输入连续性，反向或 scrollend 清除；仅内层滚动区可消费的事件不改主列表意图。

按 T047–T052 实施，复用现有 hooks/静态组件/局部 refs，不改 server API/NDJSON/数据库，不引入付费 Message List 或新 UI 库。验证包括真实 Page 生命周期与 Chrome/Virtuoso 几何，mock 不代替浏览器；Playwright 1.62.1 为 webapp 显式开发依赖，浏览器 fixture 与 API 替身仅位于 tests/。

## 2026-09-07 Streaming Render Stability Amendment (P1/P2)

### Decision

1. 流式期间冻结当前 assistant 的启发式 heightEstimates，不按 token 增量重算；Virtuoso 继续测量真实 DOM，并以真实 item size 覆盖估算。
2. 流式期间不持久化高度 hint。完成后仅在 assistant 不再 streaming、render fingerprint 稳定、item size 连续观测两次且字体/迟到布局条件满足时，允许最终高度进入本地 hint。
3. 流式内容变化不再触发独立回底命令；following 主要等待 Virtuoso totalListHeightChanged，再由单个事件驱动 rAF 合并执行。accepted turn、Composer/viewport/迟到布局和真实用户回底继续保留。
4. Streamdown 在同一消息生命周期内保持 mode=streaming 和同一个 animated 配置；finish 只切换 isAnimating，不在同一提交中切换 mode/animated。

### Contract

- heightEstimates 只用于初始 size-tree，不是流式实时高度。
- 不关闭 Virtuoso measurement，不新增消息级 ResizeObserver、debounce、轮询或第二套滚动循环。
- following 每个 animation frame 至多发出一个 scrollToEnd；streaming content render 不是独立 scroll command source。
- 已完成 assistant 满足稳定 fingerprint、两次 measurement、字体 ready、非 busy、无 disclosure 偏差后，才可成为 height-hint candidate。
- Streamdown finish 前后 mode 与 animated 保持稳定，唯一生命周期开关是 isAnimating: true -> false。

### Tasks and Acceptance

实施任务见 tasks.md Phase 9（T055–T062）。验收覆盖：增量期间估算稳定且真实 measurement 仍生效；following 每帧最多一次命令并等待 measurement 收敛；完成 assistant 可写入稳定 height hint；Streamdown mode/animated 不切换且仅 isAnimating 改变。该阶段当时不实施 T054；后续实现见下方 Messages amendment。两阶段均不修改 API、NDJSON、ThreadState 或数据库。

## 2026-09-07 Measured-Height Follow Latency Amendment

### Decision

`totalListHeightChanged` 已报告实际正向总高变化时，following 不再等待随后才到达的 `atBottomStateChange(false)` 才回底。Scroll Policy 为每个 presentation 保存最近一次已观测总高：首个 observation 只建立基线；后续仅当总高增加时，将已有 follow rAF 标为 force。rAF、`presentationKey`、pending entry 与 reading guard 保持不变，force 只跳过过期的 at-bottom 缓存，不创建第二个滚动循环或直接写 `scrollTop`。

### Contract and Non-goals

- 同一帧多次正向 measurement 继续合并为一次 `scrollToEnd('auto')`；高度未增加仍沿用普通 geometry follow。
- reading、pending conversation entry、旧 presentation 的回调和空列表均不能被 force 拉底；用户上阅仍会取消已排队的 rAF。
- 不修改 `followOutput=false`、Virtuoso measurement/heightEstimates、4px 真实 bottom 阈值、Streamdown 24ms fade 或流式缓冲节奏。
- 不采用尾部动态 reserve、token 高度预测、消息级 `ResizeObserver`、timer debounce 或原生 `scrollTop` 补偿。

实施任务见 tasks.md Phase 11（T069–T072）。验收以失败单测锁定 at-bottom 状态迟到时的下一帧回底，并以真实 Chrome 流式逐帧采样确认底部 gap 收敛、无反向 `scrollTop`、按钮与 reading 不回归。

### Scroll Button Visibility Amendment

用户反馈流式输出时按钮反复出现/消失；Chrome 以 180ms 间隔输入 20 次增量，复现 24 次显隐切换。T053 修订按钮契约：following 的瞬时离底不显示按钮；reading 且离底才显示。显式恢复跟随时保留已经显示的按钮，首次确认到底后隐藏，后续增量不得重新显示；真实向下回底同样隐藏。继续使用现有 boolean 显示状态，不新增 debounce、几何阈值或轮询。

实施顺序：先在 chat-scroll-intent.test.tsx 验证自动跟随无闪烁、reading 切入、显式恢复与实际回底；再在 chat-scroll-regression.mjs 增加真实 Page 的连续 DOM 显隐观测和慢速增量；观察失败后只修改 use-chat-scroll-policy.ts 的按钮更新规则，运行定向测试、浏览器、webapp typecheck/lint 并登记 acceptance。通知/Header 的旧调研结论已由后续 T054 正式方案覆盖。

## 2026-09-07 Messages and Local Alerts Amendment

T054 按用户确认改用 shadcn Base UI Toast 封装顶部居中 Messages；覆盖本版此前 Sonner 建议与 Header 集中提示方案。官方 base-vega/toast 通过 CLI view/dry-run 读取；直接安装会覆盖 Radix Button，故按官方源码进行局部适配，复用现有 cn/Button 和主题，不修改 components.json，不安装 Sonner。

新增 ui/message.ts 的单一 Base UI manager 与 ui/messages.tsx 的全局宿主，在根 layout 挂载一次。定位独立于聊天布局；短文案紧凑居中、长文案换行、手机安全区、可关闭和有限堆叠使用 Base UI 能力，不新增通知 store、Portal 或计时器。项目链接复制反馈通过用户事件调用 manager，稳定 id 合并重复反馈。

持续故障回到对应区域：会话列表错误复用同一 notice 插槽，分别显示在 Sidebar/移动抽屉的列表内；只读状态与重试放在 Composer 实测容器；历史加载失败仍使用内容区占位；生图限额已有对应 assistant error reply，不再保留 Header 的重复提示。移动会话导航成为消息滚动 viewport 的兄弟，采用 flex 剩余高度布局，随视口变化由 Virtuoso 测量；Header 默认留空。

测试先行：Page/会话组件验证 notice 的区域归属、重试和无 Header 提示；真实 Chrome 直接验证 Base UI Portal、类型、同 id 更新、关闭/超时、顶部居中、长文案、Radix Sheet 共存和窄屏导航几何，并重跑现有 18 个滚动场景。然后同步 canonical 契约/决策/公开事实，执行 typecheck/lint、独立 review 和范围收敛。

## 2026-09-07 Accepted Follow-up Turn Runway Amendment

已有历史的新问题 send 继续通过 accepted-turn 恢复 `following` 并使用现有 `scrollToEnd`，但当前流式轮次在消息几何内提供一个有界、viewport-relative 的 CSS reply runway。runway 使用 `clamp(10rem, calc(72dvh - bottomInset - 4rem), 48rem)`，扣除已有 Composer Footer inset 后让短 user item 约落在视口上部四分之一。`submitted`/`streaming` 阶段使用一个稳定的 TurnEntry，同时渲染 user 消息和 assistant loading slot；runway 直接作用于 slot 的 `min-height`。assistant 首包到达时只替换同一 TurnEntry 内的 slot 内容并复用 item key，不插入新的 assistant item，也不会叠加新的默认估算。浏览器以 `max(actual content height, min-height)` 自然吸收短回复；内容超过 runway 后 Virtuoso 总高才继续增长，既有 `totalListHeightChanged -> 单 rAF -> scrollToEnd` 自动接管。

runway 只由 stream hook 在接受新问题时根据提交前是否已有稳定历史决定，不从同时覆盖 send/regenerate/resume 的 `acceptedTurnRevision` 推断。首问没有历史，不启用；regenerate、resume、拒绝发送、重连、ready/失败/取消状态均不启用。实现不读取 assistant 实时高度，不新增 ResizeObserver、timer、scrollTop 数学、第二个 scroll loop 或 list handle 定位 API；Composer Footer 仍只包含实测 Composer + 54px，runway 属于当前消息 item 几何。

测试顺序：先覆盖 stream hook 只为“已有历史的新问题 send”给出定位资格、消息列表在同一 TurnEntry 的 assistant loading slot 内保持 runway、accepted-turn 仍走唯一 `scrollToEnd`；再以真实 Chrome 验证 follow-up user 的初始 viewport 位置、assistant 首次出现时逐帧位置连续、超过 runway 后正常贴底，以及首问/阅读锁/按钮回归。实施任务见 Phase 10（T063-T068）。

## Technical Context

**Language/Version**: TypeScript 5.x、Node.js 22、React 19.2.4、Next.js 16.1.6

**Primary Dependencies**: 现有 LangChain chat model/provider runtime、LangGraph checkpointer；新增 server-only direct dependency `js-tiktoken`（固定使用 `o200k_base`）与 client UI dependency `@base-ui/react@1.8.0`

**Storage**: 继续使用现有 `langgraph_chat_memory` checkpoint；无 Prisma schema、checkpoint table 或业务数据 migration

**Testing**: Vitest、现有 provider/runtime/route/stream/UI tests；新增持久滚动意图、Page 生命周期和浏览器虚拟列表回归；Qwen、DeepSeek、Ollama opt-in live smoke

**Target Platform**: 当前 Next.js server runtime、容器部署和 Electron 所连接的同一 Web runtime

**Project Type**: Turborepo 中的 Next.js web application，复用 `@ai-mind/stream-core`

**Performance Goals**: 低于触发线时零 compaction model call；单请求最多一次持久化压缩；压后 chat memory 不超过 hard input budget 的 35%

**Constraints**: 云端运行窗口 128K；Ollama 32K；当前 chat max output 4,096；最终输入估算含 10% tokenizer safety margin；不得记录原始内容

**Scale/Scope**: 当前 catalog 中 11 个 enabled chat models、所有 ordinary chat model-call paths、既有 text-only ThreadState；不改变 Agent/Delivery 内部状态

## Constitution Check

### Pre-design gate

| Principle / constraint         | Assessment                                                                          | Result |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| Controlled Agent First         | 只改变 ordinary chat context preparation；Tasklist/Delivery 仍只交接安全 final text | Pass   |
| GraphState source of truth     | 不修改 GraphState、checkpoint/resume 或 graph nodes                                 | Pass   |
| Business/checkpoint separation | 继续使用现有 chat-memory checkpoint，不新增业务历史表                               | Pass   |
| Stream compatibility           | 复用现有可选 `thread-memory-status`，不修改 chunk schema                            | Pass   |
| Public DTO safety              | 模型物理窗口、预算和日志字段均为 server-only；不返回 raw context                    | Pass   |
| Minimal Abstraction            | 只新增共享 token estimator 和明确的 context budget/preflight 业务边界               | Pass   |
| Tests Before Broad Integration | 先稳定 budget/token/compaction contracts，再接 Orchestrator 和 Provider             | Pass   |
| Spec Drift Must Be Blocked     | spec、plan、contracts、tasks、ADR 和 planned architecture transition 同步           | Pass   |
| Workspace continuity           | v0.5.3 已 release closing；v0.5.4 仅使用一个 canonical directory                    | Pass   |

### Post-design re-check

| Design choice                     | Constitutional effect                                    | Result |
| --------------------------------- | -------------------------------------------------------- | ------ |
| Server-only `contextWindowTokens` | 不扩展 PublicChatModel，不把 provider 配置暴露给前端     | Pass   |
| Shared conservative estimator     | 是所有 model-input paths 的共同业务规则，不是测试 helper | Pass   |
| Orchestrator preflight            | runtime 统一承担输入准备，route 和 provider 保持薄       | Pass   |
| Ephemeral fit                     | 不修改 persisted state，隔离请求级降级副作用             | Pass   |
| Existing state shape              | hydration、checkpoint namespace 与数据库职责不变         | Pass   |
| Final-turn safety                 | 继续遵守 ADR-0013，不保存 tool/Agent raw internals       | Pass   |

无 Constitution violation 或需要例外批准的复杂度。

## Architecture and Ownership

| Concern                      | Owner                                 | Responsibility                                                                                      | Forbidden                                               |
| ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Physical model window        | Model Catalog                         | 为每个模型声明 server-only `contextWindowTokens`                                                    | 前端猜测窗口、Provider 私自覆盖 catalog                 |
| Operational cap/config       | Model Provider Config                 | 读取云端 128K 与 Ollama 32K 配置，保持正整数校验                                                    | 用 `AI_MIND_MAX_INPUT_CHARS` 代替 token budget          |
| Token estimation             | Model Provider boundary               | 统一统计 LangChain messages、tool calls/results、structured payload 与 framing                      | 按字符数近似最终上下文、记录 payload 正文               |
| Budget derivation            | Context budget policy                 | 根据 model、environment、output reserve 计算 request budget                                         | 每条执行路径复制一套阈值公式                            |
| Persistent memory compaction | Chat Memory                           | 生成、校验并原子保存 summary/pins/recent turns                                                      | 在失败时覆盖旧 checkpoint 或留下半轮                    |
| Complete-input preflight     | Chat Orchestrator                     | 组装、计数、尝试一次 compaction、重建、ephemeral fit                                                | route 提前用完整历史做字符校验                          |
| Provider request limits      | Provider implementations              | 使用已拟合输入；Ollama 显式传 `numCtx`                                                              | Provider 临时静默删除消息                               |
| UI status                    | Existing stream/UI path               | 继续展示 started/completed/failed，并保证终态清理                                                   | 新增 breaking chunk 或输出内部预算对象                  |
| Memory usage hint            | Read-only chat usage route + Composer | 以既有 memory estimate / ContextBudget 返回两项数字，并在 skill-mode 右侧用 shadcn Tooltip 圆环显示 | hydration/stream 扩字段、浏览器估算 token、手动压缩入口 |

## Context Budget Policy

```text
effectiveWindow =
  cloud: min(model.contextWindowTokens, AI_MIND_OPERATIONAL_CONTEXT_CAP_TOKENS)
  ollama: min(model.contextWindowTokens, AI_MIND_OLLAMA_CONTEXT_TOKENS)

runtimeReserve = max(8192, ceil(effectiveWindow * 0.10))
hardInputBudget = effectiveWindow - chatMaxOutputTokens - runtimeReserve
compactionTrigger = floor(hardInputBudget * 0.70)
postCompactionTarget = floor(hardInputBudget * 0.35)
```

默认配置：

- `AI_MIND_OPERATIONAL_CONTEXT_CAP_TOKENS=128000`
- `AI_MIND_OLLAMA_CONTEXT_TOKENS=32768`
- `AI_MIND_CHAT_MAX_OUTPUT_TOKENS=4096`（现有默认）

精确派生值：

| Environment | Effective | Runtime reserve | Hard input | Trigger | Target |
| ----------- | --------: | --------------: | ---------: | ------: | -----: |
| Cloud       |   128,000 |          12,800 |    111,104 |  77,772 | 38,886 |
| Ollama      |    32,768 |           8,192 |     20,480 |  14,336 |  7,168 |

`AI_MIND_MAX_INPUT_CHARS=12000` 继续只校验请求中的最新 user input/request-body abuse boundary。route 不再用它校验包含 system/history/tool 的完整 LangChain message array；完整输入由 Orchestrator token preflight 负责。

## Model Capability Metadata

`AiMindModelCatalogItem` 增加必填 server-only `contextWindowTokens`，`resolvePublicModelList` 必须继续显式 allowlist，因此 PublicChatModel 无新字段。

| Catalog models                         | Physical context tokens |
| -------------------------------------- | ----------------------: |
| `deepseek-v4-flash`, `deepseek-v4-pro` |               1,000,000 |
| `qwen3.6-flash`, `qwen3.7-max`         |               1,000,000 |
| Doubao Seed 2.0 Code/pro/mini          |                 256,000 |
| Kimi K2.6                              |                 262,144 |
| Ollama `qwen3:4b`                      |                 256,000 |
| Ollama `qwen3:8b`, `qwen3:14b`         |                  40,000 |

这些是物理窗口，不改变 128K/32K operational cap。若 catalog 后续加入更小模型，budget policy 自动取更小值。

## Token Estimation

新增一个 server-only estimator，固定 `o200k_base`，输入为最终要发送的 LangChain messages/tool definitions 或 ThreadState text projection。计数规则：

1. role、name、text content 和 message metadata 中真正发送给 Provider 的结构化字段全部编码。
2. tool call name/arguments、tool result、tool call id 和 additional structured payload 使用稳定 JSON 序列化后编码。
3. 每条 message 增加 8 tokens framing，请求增加 3 tokens framing。
4. subtotal 乘 1.10 后向上取整，作为跨 Provider conservative estimate。
5. 只返回总量与类别数字，不返回、缓存或记录 raw content。

Provider usage observer 可以用于实现后的误差诊断，但不反向改变本次请求的 admission decision，也不建立自学习阈值。

## Persistent Compaction

### Trigger

`summary + pinnedDecisions + raw messages` 的模型可见投影达到或超过 `compactionTrigger` 时 eligible。固定 `CHAT_MEMORY_RECENT_TURN_LIMIT`、`CHAT_MEMORY_RECENT_MESSAGE_LIMIT` 和 post-compaction turn constants 退出触发/retention 语义；`AiMindThreadState` 字段不变，normalization 不再以四条消息拒绝有效 checkpoint。

### Generator input and output

- generator 输入包含旧 summary、全部 pins 和全部 raw messages，保证被移除的历史已有 summary coverage。
- compaction model `maxOutputTokens=3000`，输出仍经严格 `{ summary, pinnedDecisions }` schema 校验。
- generator 不决定 `recentMessages` 或 `lastCompactedAt`。

### Candidate construction

1. 从最新消息向前按完整 `user + assistant` pair 收集 raw turns。
2. compaction 输出和 legacy checkpoint 中的 `pinnedDecisions` 统一解释为 oldest-to-newest，最新 pin 位于数组末尾；该解释不需要 migration。
3. 仅在 `summary + pins + retained turns` 不超过 `postCompactionTarget` 时保留该完整 turn。
4. 如果最新完整 turn 自身不适合 raw retention，则保留 generator summary coverage，不切割原 turn。
5. 重新估算整个 candidate；必须不超过 target 且严格小于 original。
6. candidate 合法后才原子更新 summary、pins、messages、`lastCompactedAt`。

### Failure semantics

generator error、schema invalid、candidate not smaller、candidate over target 或 candidate saver error 均不能破坏旧 summary/pins/lastCompactedAt。当前回答完成后，`appendCompletedTurn` 必须基于 last durable checkpoint 发起一次独立 raw-turn write，而不是复用或部分提交失败 candidate。若该第二次 write 也失败，只能保留 last durable checkpoint、记录脱敏的 `raw-append-failed` 并保持已生成回答有效；系统不能在不可用 saver 上承诺物理写入成功。

请求取消不是可降级的压缩失败。Orchestrator 的同一 `AbortSignal` 必须依次传给 preflight、memory service、compaction generator 和结构化模型 invocation；在读 checkpoint、模型返回和写 checkpoint 的边界检查取消。`AbortError` 必须原样穿过 preflight，不能进入 ephemeral fit；一旦观察到取消，不能再启动新的 checkpoint 写入、answer model 调用或 raw final-turn append，既有 checkpoint 保持不变。

## Complete-input Preflight

Chat Orchestrator 建立一个统一 input-preparation boundary，调用顺序固定为：

```text
assemble dynamic non-memory input + current ThreadState projection
  -> derive selected-model budget
  -> count complete input
  -> if memory >= trigger OR complete input > hard input
       -> attempt persistent compaction once
       -> reload/rebuild/recount
  -> if request is cancelled at any boundary
       -> propagate AbortError; do not build ephemeral fit
  -> if still over budget
       -> create ephemeral fit for this request only
  -> if non-memory content alone still over budget
       -> existing InputLengthExceededError
  -> call model with fitted input
```

ephemeral fit 顺序：

1. 预留所有 non-chat-memory 内容和最新 user input。
2. 把 durable `pinnedDecisions` 解释为 oldest-to-newest，并从数组末尾向前加入能完整容纳的 pins；放不下的 pin 仅在当前 request-local projection 中省略，不裁剪单条 pin，也不回写 state。
3. 加入 existing summary；若 summary 单独挤占预算，对本次请求做 token-safe deterministic shortening，不回写 state。
4. 从新到旧加入完整 recent turns。
5. 重新计数，只有不超过 hard input budget 才交给 Provider。

所有读取 chat memory 的路径都使用该 boundary：direct answer、tool planning、tool final synthesis、Composer Context final、Capability Context final。Tasklist/Delivery 的内部模型输入与 GraphState 不混入 chat memory；其 final visible turn 仍由现有 adapter 在完成后写入，下一次 ordinary chat preflight 再处理。

## Status and Observability

- 复用 `thread-memory-status` 的 started/completed/failed 值，不增加 token 数值或 raw error 到 public chunk。
- 所有 compaction success/failure/cancel/finally 分支都必须使 UI status 进入终态；取消路径以 failed 终态收口但不作为普通压缩失败进入 fallback。
- server logs 使用结构化数字字段：`modelId`、physical/effective window、hard/trigger/target、before/after、trigger reason、persistent result、ephemeral fallback。
- 日志禁止 raw message、summary、pins、prompt、tool args/result、cookie、API key、base URL 和 provider config。

## Composer Memory Usage Hint

1. `GET /api/chat/context-usage` 复用 session resolution、conversation registry ownership、chat-memory read、model catalog selection 和 ContextBudget；route 与 client 共同消费 `chat-memory/context-usage-contract.ts` 的 strict schema，且只返回 `{ usedPercent, effectiveWindowTokens }`。
2. 分子固定为 persisted `summary`、`pinnedDecisions` 与 complete raw messages 的 conservative estimate；分母固定为 selected model 的 effective window，cloud 为 128K cap、Ollama 为 32K cap（或更低 physical window）。
3. `InstantMindPage` 以独立 client hook 在已选择的非 draft 会话空闲时请求数据；模型切换和 normal `finish` 后刷新，streaming 时不发起请求。失败、缺少会话或取消请求只隐藏 indicator，不能显示错误或影响发送。
4. `ChatComposer` → `ComposerToolbar` 接收 nullable snapshot。圆环只在 `md` 及以上显示，位于 ToggleGroup 后；视觉进度可 clamp 到 100%，但 Tooltip 显示真实整数百分比并以 `128K`/`32K` 格式化窗口。
5. 使用 shadcn CLI 安装的 `components/ui/tooltip.tsx`，触发物为可键盘聚焦的非 button 元素；无 visible percentage、`title` 重复提示、压缩按钮或其它操作。

## Failure Matrix

| Condition                             | Persisted state                                                                                | Current request                                               | Public result                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Valid compaction                      | Atomically replace with valid candidate                                                        | Rebuild and continue                                          | Existing completed status                        |
| Generator/schema/candidate failure    | Preserve old state; independently append latest completed turn after answer                    | Ephemeral fit and continue                                    | Existing failed status, normal answer may follow |
| Candidate save failure                | Preserve last durable checkpoint; independently attempt raw completed-turn append after answer | Ephemeral fit and continue                                    | Existing failed status, normal answer may follow |
| Request cancellation while compacting | Preserve existing checkpoint; do not start a new write                                         | Propagate `AbortError`; no ephemeral fit or answer model call | Terminal failed status; no answer                |
| Raw completed-turn append failure     | Preserve last durable checkpoint; log sanitized `raw-append-failed`                            | Already produced answer remains valid                         | Existing answer; no raw persistence claim        |
| Still over after compaction           | Preserve valid checkpoint                                                                      | Ephemeral fit and continue                                    | No memory-caused length error                    |
| Non-memory alone over hard budget     | No destructive memory change                                                                   | Do not call model                                             | Existing input-length error                      |
| Provider/network failure              | Completed-turn rules unchanged                                                                 | Existing provider error handling                              | Existing error contract                          |

## Project Structure

### Documentation

```text
specs/v0.5.4-token-aware-memory-compaction/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── decisions.md
├── acceptance.md
├── contracts/chat-context-budget.md
├── contracts/chat-scroll-policy.md
├── checklists/requirements.md
├── checklists/memory-compaction.md
├── checklists/chat-scroll.md
└── tasks.md
```

### Source Code

```text
apps/webapp/
├── app/
│   ├── layout.tsx
│   └── api/chat/context-usage/route.ts
├── components/
│   ├── chat/composer/
│   │   ├── chat-composer.tsx
│   │   └── toolbar/
│   │       ├── composer-toolbar.tsx
│   │       └── context-usage-indicator.tsx
│   ├── instamind/
│   │   ├── instantmind-page.tsx
│   │   └── use-chat-memory-usage.ts
│   └── ui/tooltip.tsx
├── lib/ai/model-provider/
│   ├── catalog/model-catalog.ts
│   ├── context-budget.ts
│   ├── index.ts
│   ├── provider-config.ts
│   ├── token-estimator.ts
│   ├── types.ts
│   ├── validate-input-length.ts
│   └── providers/ollama-provider.ts
├── lib/ai/runtime/
│   ├── chat-context-preflight.ts
│   ├── chat-orchestrator.ts
│   └── chat-memory/
│       ├── state-schema.ts
│       ├── context-usage-contract.ts
│       ├── compaction.ts
│       ├── chat-memory-service.ts
│       └── context-builder.ts
└── tests/lib/ai/
    ├── model-provider/
    └── runtime/
```

**Structure Decision**: 保持现有 webapp 模块结构。budget/token 类型由 model-provider 边界所有；ThreadState compaction 留在 chat-memory；跨阶段输入拟合由 Chat Orchestrator 统一调用。只有存在明确业务规则或多路径真实复用时才提取模块，不为测试建立 production-only helper。

## Verification Strategy

1. 先为 catalog metadata、预算精确值、token estimator 和 Ollama `numCtx` 写失败测试。
2. 再为 token trigger、完整 turn retention、oversized latest turn、invalid candidate 和 append-on-failure 写失败测试。
3. 为 Orchestrator preflight 写 success、generator/schema/candidate/candidate-save failure、still-over 和 non-memory-over 路径测试，覆盖 ephemeral fit 后的 model invocation 与所有 memory-injecting calls。
4. 分别验证 candidate save failure 后 raw append 成功，以及 raw append 自身失败时保留 last durable checkpoint 且不撤销已生成回答。
5. 回归 hydration、pinned promotion、safe final-turn adapters、status chunk、UI reducer、Tasklist/Delivery final-turn boundaries。
6. 运行 targeted Vitest、稳定 webapp tests、typecheck、lint 和 `git diff --check`。
7. 使用 opt-in live smoke 分别验证 Qwen、DeepSeek 与 Ollama；记录模型/预算/结果，不记录正文。
8. 滚动修订按 `quickstart.md` Phase 5.5 验证持久意图、accepted-turn、展示身份和几何变化：following 合并事件对齐，reading 零拉底命令；completion revision 仅保留 memory usage 的正常完成刷新语义。浏览器脚本自启隔离 fixture，验证真实 Page/Virtuoso 与 bounded DOM。

## Release-closing Boundary

本地实现、验证与公开资产收口以 `acceptance.md` 为准；其中保留 Provider smoke 的既有通过结果与 Qwen quota 环境限制。新增滚动修订必须完成 T051 验证及 T040 converge，再登记 T052/T042 完成。ADR、architecture、README、公开 version/release/tasklist 和 lockstep 0.5.4 版本号随真实实现同步；commit、tag 与 GitHub Release 不属于本次本地交付。

## 2026-09-07 Accepted Early Stream Buffer Flush

保留 40ms timer 合并；pending text/reasoning Map 累计达到 48 个 Unicode code point 时，提前请求既有的下一 rAF flush。该 rAF 仍一次完整提交当前 Map，不拆分内容、不维护展示队列；代码围栏的既有结构性提前路径不变。

此变更不触及 `useChatScrollPolicy`、`followOutput`、Virtuoso 配置、原生 `scrollTop` 或独立滚动命令。此前快速 Chrome fixture 对该阈值记录过更高 measurement 频率，但它不构成像素残影根因；残影和快速流视觉体验另行优化与验收。
