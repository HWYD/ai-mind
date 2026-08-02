# Implementation Plan: Image Generation Agent

**Branch**: `[codex/v0.4.12-image-generation-agent]` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/v0.4.12-image-generation-agent/spec.md`

## Summary

v0.4.12 在现有聊天页面增加 `/image` 显式入口，并以独立、受控的 LangGraph Image Generation Agent 完成：

```text
用户描述
→ ImageBrief
→ 执行 Prompt
→ 结构化检查
→ 可选的一次 Prompt 修订
→ 再检查
→ 一次 Seedream 生图
→ 当前页面临时预览与下载
```

图像模型固定为 `doubao-seedream-5.0-lite`，完整服务端点固定为火山引擎 Agent Plan 专属 URL `https://ark.cn-beijing.volces.com/api/plan/v3/images/generations`。固定值不进入用户模型选择、Chat Model catalog 或多 Provider Router。ImageBrief 和 Prompt 优化复用本轮已选择的聊天 LLM；最终生图由独立 Seedream image provider adapter 执行。

Agent 采用“有界 ReAct 风格条件图”，而不是开放式 ReAct loop：结构化 inspection 充当 Observe/Reason，最多一次 prompt revision 充当 Act，第二次 inspection 后只能生成或阻断。代码硬限制 `maxPromptRevisions = 1`、`maxImageGenerations = 1`；规划阶段模型调用限制为 `maxPlanningModelCalls = 5`。正常直通路径通常使用 3 次规划调用，发生一次修订时最多使用 5 次，既允许一次有界 ReAct 修订，又不会形成隐藏循环。每次规划输出只进行一次严格结构解析；解析失败仍消耗该次 planning call，并以 `IMAGE_PROMPT_PLANNING_FAILED` 安全终止，不做隐藏的 JSON/schema 修复调用、模型重试或图片生成。每个规划节点调用模型前检查全局计数；计数已达 5 且仍需下一次规划调用时，同样以 `IMAGE_PROMPT_PLANNING_FAILED` 终止。

图片二进制不进入 PostgreSQL、StreamEvent、GraphState、日志或容器文件系统。服务端只保存短期 provider URL 与安全元数据，通过同源、鉴权、有限读取的图片代理返回字节；浏览器获取一次 Blob，并用同一 Blob 完成预览与下载。

新增每日配额边界：每个浏览器 Session 每日最多 3 个被接受的新 `/image` 任务；IP 维度默认每日最多 10 个作为防刷上限，并允许部署时在 10–20 范围内调整。配额独立于普通聊天、Tasklist 和 Delivery Chain，幂等重放、无效请求和活动任务冲突不计数，已接受任务即使后续失败仍消耗一次配额。

## Technical Context

**Language/Version**: TypeScript 5.x；Node.js `>=22 <23`

**Primary Dependencies**: Next.js 16.1.6、React 19.2.4、LangChain Core 1.1.48、LangGraph 1.3.6、Zod、Prisma 7.8、`@ai-mind/stream-core`

**Storage**: PostgreSQL 保存 `StreamRun`、`StreamEvent`、`ImageGenerationRun` 短期业务元数据和 provider 临时 URL；不保存图片二进制，不新增 OSS、S3、持久卷或本地图片目录

**Testing**: Vitest、Prisma integration tests、React Testing Library、现有 stream contract/reducer/route tests、浏览器 smoke；最终执行 `pnpm typecheck`、`pnpm lint:webapp`、相关 package tests 与 build

**Target Platform**: Next.js Node runtime；Linux Docker production；现代浏览器支持 `Blob`、`URL.createObjectURL` 和 download

**Project Type**: pnpm monorepo Web application（Next.js frontend + server API + shared stream protocol + PostgreSQL）

**Performance Goals**: 正常成功请求 95% 从服务端接受合法 `/image` 开始，到当前页面 `ImageResultPart` 完成同源读取、Blob 创建和图片 load 为止不超过 120 秒；该口径包含规划、Seedream 调用、临时图片代理读取和浏览器解码。服务端同时记录从 StreamRun 创建到 `image-result-ready` 的可分阶段耗时，前端验收记录端到端耗时；单次真实 smoke 只记录样本，不用来宣称 95% SLO。停止操作 1 秒内让当前 UI 进入 cancelled；同一会话并发请求始终最多一次实际生图

**Constraints**:

- 每日生图配额默认 `3/session`、`10/IP`；IP 上限可由服务端在 `10..20` 范围内配置，普通聊天不消耗生图配额

- 仅 `/image` 显式入口；普通聊天不做意图路由
- 固定模型和固定 Agent Plan endpoint；客户端不得覆盖
- 无 HITL、无 checkpoint/resume、无生成后视觉复评或重画
- Prompt 自动修订最多 1 次，实际图片生成最多 1 次
- planning LLM 调用最多 5 次；正常路径约 3 次，修订路径最多 5 次
- 单张文生图；不支持 reference image、编辑、局部重绘、扩图、去背景、组图或多候选
- Provider 调用按一次非流式 HTTP 请求处理；用户看到的是 AI Mind 自身阶段，不是 Provider 百分比进度
- 取消为本地逻辑取消和 best-effort HTTP abort，不承诺 Provider 已停止推理
- Provider URL、内部 Prompt、raw GraphState、raw provider error、API Key 不得进入 public DTO
- 图片读取必须校验所有权、状态、来源、重定向、类型、magic bytes、体积和超时
- 临时结果本地可读取窗口固定为 ready 后 10 分钟；可靠 provider expiry 更早时取更早值
- 不自动重试状态不明确的生图请求

**Scale/Scope**: 单一 Image Agent、单一 Seedream provider、单图结果、单浏览器会话最多一个 active image run；不建设通用 Media Platform 或多 Agent 图像工具链

## Constitution Check

_GATE: Phase 0 前已检查；Phase 1 设计完成后复查。_

| Constitution Principle                 | Result | Design Evidence                                                                                                                               |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Controlled Agent First                 | PASS   | `/image` 是唯一入口；工具范围只有 Agent 私有 Seedream 调用；无隐式路由、HITL、编辑链或跨 Agent 调用                                           |
| GraphState Is Runtime Source of Truth  | PASS   | Image Agent 使用独立 GraphState；Prompt/inspection/counters 在图内；DB client、writer、AbortSignal、API Key 和 raw Error 只在 runtime context |
| Review Node Must Be Side-effect Free   | N/A    | 本版没有 interrupt/review node；prompt inspection 是普通纯模型节点，不产生 HITL                                                               |
| Business State and Checkpoint Separate | PASS   | 不使用 PostgresSaver；`ImageGenerationRun` 是业务状态，GraphState 是单次执行状态；graph node 不直接写数据库                                   |
| Stream Compatibility                   | PASS   | 复用现有 workflow progress，并新增独立、可选的 `image-brief` 与 `image-result-ready` chunk；不改变 text artifact 语义                         |
| Public DTO Strict and Safe             | PASS   | 所有新 chunk 和 route response 使用 strict schema；不包含内部 Prompt、provider URL、raw error 或图片 bytes                                    |
| Minimal Abstraction                    | PASS   | 新增窄领域 Image Agent、Seedream adapter、ImageGenerationRun；不泛化 Chat Provider、Tasklist AgentRun 或通用 Media Artifact                   |
| Tests Before Broad Integration         | PASS   | contract/schema → graph/provider → persistence/concurrency → route/stream → frontend → smoke                                                  |
| Spec Drift Must Be Blocked             | PASS   | 本变更同步 spec、plan、contracts、ADR、architecture docs、env/deployment说明和公开版本文档                                                    |
| Official Spec Kit                      | PASS   | 使用 official `speckit-clarify` 与 `speckit-plan`，后续继续 `speckit-tasks`、`speckit-analyze`、`speckit-converge`                            |
| Spec Kit Language Policy               | PASS   | 英文文件名/section/标识符，中文正文；保留 GraphState、StreamRun、public DTO 等技术名词                                                        |

### Constitution Re-check After Phase 1

结果：**PASS，无需 Complexity Tracking 例外**。

需要在实现阶段继续把守的三项硬门禁：

1. 不为复用而把现有 Tasklist `AgentRun`、`AgentInterrupt` 或 Chat `ModelProvider` 泛化。
2. 不把 provider URL、内部 Prompt、图片 Base64 或 bytes 投影到 StreamEvent。
3. 并发门禁、取消后的迟到结果丢弃必须由数据库/服务端原子条件保证，不能只靠前端。

## Project Structure

### Documentation (this feature)

```text
specs/v0.4.12-image-generation-agent/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── image-agent-stream-contract.md
│   ├── seedream-provider-contract.md
│   └── temporary-image-content-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # 由后续 /speckit-tasks 生成
```

长期事实同步：

```text
docs/adr/
└── 0016-controlled-image-generation-agent.md

docs/architecture/
├── agent-runtime.md
├── stream-core.md
├── stream-recovery.md
└── image-generation-agent.md

docs/versions/
docs/releases/
README.md
```

### Source Code (repository root)

```text
apps/webapp/
├── app/api/chat/
│   ├── route.ts
│   └── runs/[runId]/
│       ├── cancel/route.ts
│       ├── image/route.ts
│       └── stream/route.ts
├── components/chat/
│   ├── composer/
│   └── message-list/parts/
├── components/instamind/
│   ├── chat-stream/
│   └── local-chat-persistence/
├── lib/ai/
│   ├── image-provider/
│   │   ├── image-provider-config.ts
│   │   ├── normalize-image-provider-error.ts
│   │   ├── seedream-image-provider.ts
│   │   └── types.ts
│   ├── runtime/image-generation-agent/
│   │   ├── contract/
│   │   ├── graph/
│   │   │   ├── edges/
│   │   │   ├── nodes/
│   │   │   ├── create-image-generation-graph.ts
│   │   │   ├── graph-node-ids.ts
│   │   │   ├── graph-state.ts
│   │   │   └── run-image-generation-graph.ts
│   │   ├── stream/
│   │   └── image-generation-run-coordinator.ts
│   ├── stream-recovery/
│   └── types/
└── tests/
    ├── app/api/chat/
    ├── components/
    └── lib/ai/

packages/
├── database/
│   └── prisma/
│       ├── migrations/
│       └── schema.prisma
└── stream-core/
    ├── src/protocol/chat-stream-chunk.ts
    └── tests/protocol/chat-stream-chunk.test.ts
```

**Structure Decision**: 保持现有 monorepo 与 `/api/chat` 主入口。Image Agent 是 `apps/webapp/lib/ai/runtime` 下的独立受控 Agent；Seedream 是独立 image provider boundary，不进入 chat provider catalog；`packages/stream-core` 只承载新的严格 public stream DTO；`packages/database` 只增加窄领域业务元数据。

## Technical Plan

### 1. Explicit Entry and Early Routing

- 在 `ChatComposerCommandName`、request schema、command menu 中加入 `image`。
- `/image` 必须包含非空描述，且不得带 reference image 或多个结果参数。
- `/api/chat` 将命令映射为 `StreamRun.kind = image_generation`。
- `ChatOrchestrator` 在 `lifecycle.emitStartOnce()` 后、`createChatSession()` 和 chat/user memory hydration 前优先分流 `/image`，完整短路普通 Composer、Skill、Tool Calling、Direct Answer 和 chat memory final-turn。
- Prompt planning LLM 继续使用本轮已解析的 chat model selection，但 route type 标为 `image` 以区分限流、usage 和日志；它不改变固定图像模型。

### 2. Bounded Image Agent Graph

Graph nodes：

```text
buildImageBrief
→ draftImagePrompt
→ inspectImagePrompt
→ routeAfterInspection
   ├─ pass ──────────────────────────────→ generateImage
   ├─ revise → reviseImagePrompt → reinspectImagePrompt
   │                                    ├─ pass/non_blocking → generateImage
   │                                    └─ blocking → stopBeforeGeneration
   └─ blocking → stopBeforeGeneration
→ validateTemporaryResult
→ complete
```

- `buildImageBrief` 产生内部严格 schema 和只读 `PublicImageBriefSummary`。
- `draft/inspect/revise/reinspect` 只调用 planning LLM；inspection 输出有限 issue codes、severity、revision instruction，不输出 chain-of-thought。
- `revisionCount` 与 `generationCount` 由 reducer/edge 代码硬校验；超过上限抛 runtime invariant，不依赖模型自律。
- 第一次 inspection 的 blocking 且可修复问题允许一次 revision；revision 后仍 blocking 则不调用 Seedream。
- revision 后只剩非阻断不足时允许生成，但不允许第二次 revision。
- `generateImage` 是 Agent 私有原子 capability，不注册为普通全局 Tool。
- Graph 不启用 checkpointer，不使用 HITL、interrupt、resume、Tasklist AgentRun 或 AgentInterrupt。

### 3. Fixed Seedream Provider

- 新建 `ImageGenerationProvider` 最小接口，只暴露 `generate(input, { signal })`。
- 在 `apps/webapp/lib/ai/image-provider/image-provider-config.ts` 中集中定义固定配置：
    - `model = "doubao-seedream-5.0-lite"`
    - `endpoint = "https://ark.cn-beijing.volces.com/api/plan/v3/images/generations"`
- 模型和 endpoint 允许由服务端 config module 读取，但不放入 env、不进入客户端、不接受请求覆盖；直接复用项目既有的豆包 Key `AI_MIND_DOUBAO_API_KEY`，不新增图片专用 Key 或 env。
- Key 缺失时在调用前安全失败。
- 客户端 payload、command 或模型选择器不能覆盖 model/endpoint。
- 首版最小请求：`model`、`prompt`、关闭组图参数、`response_format: "url"`；默认画幅/size 由 smoke test 固化，未验证前不扩展 seed、guidance、provider prompt optimizer、stream 或 image input。
- 透传 `AbortSignal`；不自动重试任何生成请求。
- 严格解析响应，只接受一个 HTTPS 临时结果；provider error 归一化为安全稳定错误码。
- 内容安全以 Seedream 拒绝为最终判定，不做自动改写或绕过审核重试。

### 4. Business State, Atomic Concurrency and Cancellation

- `StreamRunKind` 增加 `image_generation`，继续复用现有幂等、event retention、取消和终态投影。
- 新增窄领域 `ImageGenerationRun`，不修改 Tasklist `AgentRun` 的必填字段和 HITL 语义。
- 使用 nullable `activeOwnerSessionHash` + database unique constraint 作为原子并发租约：
    - active run 写 owner hash；
    - completed/failed/cancelled 时在同一终态事务清空；
    - 相同 idempotency key replay 原 run；
    - 不同 key 冲突返回 `409 IMAGE_GENERATION_ALREADY_ACTIVE`；
    - `activeLeaseExpiresAt` 用于清理进程异常留下的 stale lease。
- coordinator 是唯一业务持久化边界；graph node 不直接写 Prisma。
- 取消复用现有 run-scoped `AbortController`、cancel intent 与 cancel route。
- 在调用 Provider 前、Provider 返回后持久化前、发出 ready/finish 前三次检查 abort/cancel。
- 迟到结果不得保存为 ready、不得发 chunk、不得覆盖 cancelled；临时 content route 对 cancelled run 永久拒绝。

### 4.1 Daily Image Quota and Abuse Guard

- 扩展现有服务端 rate-limit config，增加 `imageDailyLimitPerSession`（默认 3）和 `imageDailyLimitPerIp`（默认 10）两个独立配置；对应环境变量仅用于部署调节，不进入客户端 DTO。
- `MemoryRateLimitStore` 为 `image` 建立独立的自然日计数桶，不能复用普通聊天桶；同一 IP 的多个 Session 共享 IP 桶，同一 Session 的普通聊天不消耗 image 桶。
- `/api/chat` 在幂等重放检查后执行 image 配额检查；活动租约冲突发生时回滚本次预占计数，确保“被接受的新任务”才计数。达到 Session 或 IP 上限返回 429 和稳定的 `MODEL_PROVIDER_RATE_LIMITED`，不创建 `StreamRun`、不进入普通聊天。
- 配额计数使用当前单进程内存限流边界，重启清零、多实例不共享；本次小需求不引入 Redis/KV，但必须在公开文档中明确该限制。

### 5. Stream and Public DTO

- 复用 `workflow-progress-start/step/end` 展示：
    - received
    - brief
    - prompt
    - generation
    - result
- 新增 `image-brief` chunk，只有 `PublicImageBriefSummary`。
- 新增 `image-result-ready` chunk，只有 run identity、同源 content path、建议文件名、temporary flag 和安全图片元数据。
- Stream 不传 provider URL、internal prompt、inspection details、Base64、bytes 或 raw GraphState。
- 新 DTO 在 `stream-core` 和 webapp 消费边界使用 strict schema；同步 projector、writer、replay、reducer 和 UI tests。
- 不复用 text artifact，也不改现有 artifact semantics。

### 6. Frontend Component Composition

前端在 plan 阶段确定组件边界和状态契约，在 tasks 阶段再细化文件改动、props、测试和样式实现：

- `ImageBriefPart`：使用 `Card`、`CardHeader`、`CardContent` 和 `Badge`，展示只读 `PublicImageBriefSummary`。
- `ImageResultPart`：使用 `Card`、`AspectRatio`、`Button` 和 `Badge`；内部组合 `Skeleton` loading 状态与 `Alert` error 状态。
- 图片预览沿用 shadcn 官方 `AspectRatio + Image` 组合；Blob/object URL 生命周期保留在结果组件内部，不新增通用媒体抽象。
- 下载使用已有 `Button`，复用同一个 Blob URL；临时性使用 `Badge` 或 `CardDescription` 表达。
- 阶段展示继续复用现有 `WorkflowProgressPanel`，不新建第二套进度组件。
- 图片生成结果消息在完成后继续复用现有 `FollowUpSuggestions` 推荐问题组件；推荐问题属于普通聊天后续提问入口，使用语义化分组承载，点击不重新进入 Image Agent。
- 组件必须是只读/展示型，不提供 Prompt 编辑、确认或生成重试操作。
- 图片 `alt` 只能由 `PublicImageBriefSummary` 的公开字段构造，不得包含 internal Prompt；下载操作使用原生可聚焦交互语义和明确 accessible name。
- loading、完成和失败状态分别使用语义化 status/`aria-live="polite"` 与既有 `Alert` 语义表达；状态更新不强制抢占用户焦点。
- 既有停止操作继续使用可键盘访问且有明确 accessible name 的原生交互；过期后的 `/image` 重新发起说明保留在语义化 `Alert` 中。

已确认项目已有 `Card`、`Skeleton`、`Alert`、`Badge`、`Button`。`AspectRatio` 是官方 shadcn/ui primitive，但当前未安装；在实现早期通过 shadcn CLI 添加其源码到 `apps/webapp/components/ui/`。这不引入新的 UI 依赖或图片组件库。

### 7. Temporary Preview and Download

- 新增 `GET /api/chat/runs/{runId}/image`：
    - 派生当前 `ownerSessionHash`；
    - 校验 StreamRun/ImageGenerationRun 所有权和 `completed + ready + not expired + not cancelled`；
    - provider URL 只能来自数据库，客户端不能提交 URL；
    - 仅 HTTPS、无 userinfo、自定义端口或 IP literal；
    - 基于真实 smoke response 建立精确 host allowlist；
    - 首版 `redirect: manual` 并拒绝重定向；
    - 校验 status、Content-Length、实际 bytes 上限、MIME allowlist 与 PNG/JPEG/WebP magic bytes；
    - 使用有界内存读取，不写磁盘；
    - 返回 `private, no-store`、`nosniff` 和安全 `Content-Disposition`。
- 前端完成消息后只 fetch 一次 content path，生成一个 Blob URL；同一 Blob 用于 `<img>` 与下载。
- 组件 unmount、结果替换、取消时 abort fetch 并 `URL.revokeObjectURL()`。
- Blob、object URL 和 image part 不进入 stable local snapshot；刷新后不承诺恢复。
- `providerResultExpiresAt = min(provider reliable expiry, readyAt + 10 minutes)`；content lookup 先执行逻辑过期，再由 repository 在查询/新任务获取路径执行有界、幂等的 URL 置空清理。

### 8. Security, Observability and Failure Mapping

- 公共错误至少区分：
    - empty/unsupported request
    - prompt blocked
    - already active
    - provider content rejected
    - provider auth/config failure
    - provider rate/availability/timeout
    - ambiguous generation state
    - invalid/expired/unavailable temporary result
- 401/403/429/5xx 和 Seedream 输入/输出安全拒绝只映射安全信息。
- 日志记录 runId、stage、revision count、generation count、duration、safe error code；不记录 API Key、internal prompt、完整 provider URL 或 raw moderation response。
- duration 同时记录各安全阶段耗时以及从 StreamRun 创建到 `image-result-ready`/terminal 的服务端总耗时；浏览器端验收从提交开始记录到图片 `load` 成功的端到端耗时，不写入 Prompt、URL 或图片内容。
- 由于本版不做成本预估，usage/cost 数据不得进入 UI；如 provider 返回 usage，只允许非敏感 operational metric 且不影响产品逻辑。

### 9. Test and Delivery Order

1. implementation 前先执行 Agent Plan 契约探测门禁，确认单图请求、响应结构、URL host/type/size/expiry 与 abort 行为
2. command/request/public DTO contracts
3. ImageBrief/inspection/graph routing and hard-limit tests, including `maxPlanningModelCalls = 5` and schema-invalid terminal failure
4. image daily quota tests for Session/IP limits, route-bucket isolation, idempotent replay, invalid request and active-conflict rollback
5. fixed Seedream provider contract and safe error tests
6. `ImageGenerationRun` repository、atomic concurrency、stale lease、expired-result cleanup 与 cancel race integration tests
7. route/orchestrator/StreamRun/projector/replay tests
8. reducer、ImageBrief、Blob preview/download、accessibility、cleanup 与 error UI tests
9. existing chat/Tasklist/Delivery regression
10. typecheck、lint、build
11. Agent Plan 专属 endpoint 回归 smoke：single generation、content rejection、abort、temporary URL host/type/size
12. ADR、architecture、version/release、README 与 package version closing

## Implementation Readiness Constants

- `/image` must be the first non-whitespace token. The server normalizes the description with Unicode NFC, trims Unicode whitespace, and accepts `1..2000` code points only.
- ImageBrief/public-summary bounds, allowed assumptions, issue-classification criteria and the one atomic pre-provider `imageGenerationCount 0 -> 1` marker are owned by `spec.md` §Implementation-Ready Rules; graph/runtime tests must use those rules directly.
- Canonical abstract aspect ratios are `square`, `landscape`, `portrait`, with `square` as default. T003 is the only source for their fixed Provider `size` mapping.
- Temporary-content limits are exactly 15 seconds upstream time, 20 MiB declared/actual bytes, and JPEG/PNG/WebP only. Exact approved Provider hosts are server config, never learned at runtime.
- A complete ready result has `expiresAt = min(reliable provider expiry, readyAt + 10 minutes)`. The content route can read valid result metadata independently of StreamEvent payload retention, but snapshot/reload recovery remains non-guaranteed.
- Additive migration and stale-lease reconciliation are forward-only: an interrupted deploy never resumes a graph or repeats provider generation.

## External Contract Gate

以下是 T003 必须完成的 implementation 前接入验证，不是模型/端点选型问题。T028 Seedream adapter 和 T036 temporary content service 在该门禁通过、契约文件写入已确认事实前不得开始；T055 在实现完成后使用相同固定端点做回归 smoke，而不是首次发现契约：

- 目标环境可通过 `AI_MIND_DOUBAO_API_KEY` 调用固定 Agent Plan endpoint。
- 固定字符串 `doubao-seedream-5.0-lite` 被专属 endpoint 接受。
- 单图关闭组图参数、`response_format: "url"` 和默认 size 的实际契约。
- 成功响应字段、错误结构、临时 URL host、重定向、MIME、大小与有效期。
- Provider 请求收到 AbortSignal 时的本地行为。

验证失败时必须更新 provider contract 或账号配置；不得未经用户确认替换固定模型或 endpoint。

## Complexity Tracking

无 Constitution 例外。
