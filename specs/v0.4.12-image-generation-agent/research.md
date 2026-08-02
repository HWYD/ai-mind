# Research: Image Generation Agent

**Feature**: v0.4.12 Image Generation Agent  
**Date**: 2026-07-28  
**Status**: Complete

## Decision 1: Fixed Agent Plan Seedream Integration

**Decision**

使用用户确认的火山引擎 Agent Plan 专属契约：

```text
POST https://ark.cn-beijing.volces.com/api/plan/v3/images/generations
Authorization: Bearer ${AI_MIND_DOUBAO_API_KEY}
Content-Type: application/json
model: doubao-seedream-5.0-lite
```

模型和完整 endpoint 都是 v0.4.12 固定值。现有 `.env.example` 已使用 `https://ark.cn-beijing.volces.com/api/plan/v3` 作为 Doubao Agent Plan 基址，说明该路径与项目部署体系一致。

**Rationale**

- 这是目标账号的 Agent Plan 专属接入，不是公开 Ark 通用端点选型。
- 本版只有单一图像模型，不需要 model catalog、provider registry 或用户选择。
- Key 已有服务端配置边界可复用，但 Chat Provider 的 `BaseChatModel` 接口不适合图片结果。

**Alternatives Rejected**

- 改用公开通用 `/api/v3/images/generations`：与用户确认的专属契约冲突。
- 把 Seedream 加入 Chat Model catalog：Chat Provider 返回 `BaseChatModel`，会污染模型能力边界。
- 客户端传 model/base URL：扩大权限并产生配置注入风险。

**Implementation Gate**

该真实 smoke 明确归入 T003，并且必须发生在 T028 Seedream adapter 与 T036 temporary content service 之前；T055 只做同一固定契约的发布前漂移回归，不再承担首次发现请求/响应字段的职责。

专属接口的请求字段、响应结构、临时 URL host 和安全错误结构需做真实 smoke；验证失败时调整 adapter contract 或账号配置，不替换固定 model/endpoint。

## Decision 2: Independent Image Provider Boundary

**Decision**

新增最小 `ImageGenerationProvider`：

```ts
interface ImageGenerationProvider {
    generate(input: { prompt: string; size: string }, options: { signal: AbortSignal }): Promise<InternalTemporaryImageResult>
}
```

Seedream adapter 负责固定配置、鉴权、request/response schema、AbortSignal 和错误归一化。它属于 Image Agent 私有 capability，不注册到普通 Tool registry。

**Rationale**

- 现有 `ModelProvider` 只生产 `BaseChatModel`，与 image generation response 不同。
- 独立 adapter 能保持单 Provider 的窄边界，并为 contract test 隔离外部副作用。
- Agent 可以复用 selected chat LLM 形成 ImageBrief/Prompt，但最终图片模型保持固定。

**Alternatives Rejected**

- 给 `ModelProvider` 增加 `generateImage()`：为单一版本泛化所有 Chat Provider。
- 把图片 URL包装成普通 Tool 文本：会丢失严格 DTO、所有权和临时资源语义。
- 先建设通用 media provider：超出单链路范围。

## Decision 3: Bounded ReAct-style Graph, Not Open ReAct

**Decision**

使用独立 LangGraph 条件图：

```text
build brief
→ draft prompt
→ inspect
→ pass | revise once | block
→ reinspect after revision
→ generate once | block
```

它体现的 ReAct 是：

- **Observe**：ImageBrief 是用户意图事实源。
- **Reason**：Prompt Inspection 输出有限 issue code 和 severity。
- **Act**：只允许一次 revision。
- **Observe again**：reinspection。
- **Final Act**：生成一次，或生成前阻断。

`revisionCount <= 1` 和 `generationCount <= 1` 由代码硬限制。

**Rationale**

- 能讲清 Agent 的状态、条件边和工具执行，具备面试价值。
- 相比开放式反思循环，行为、延迟和失败边界可验收。
- Prompt 优化发生在图片生成前，不需要生成后视觉模型或第二次生图。

**Alternatives Rejected**

- 三次或开放式自动修订：用户已确认保持一次；收益不可控，链路更长。
- 单次 LLM 一步生成 prompt：实现简单，但没有可审计的 ImageBrief/inspection 决策。
- 生成后看图再重画：需要视觉理解并突破“一次实际生图”。

## Decision 4: Independent GraphState, No HITL or Checkpointer

**Decision**

Image Agent 使用独立、JSON-serializable GraphState。内部 Prompt、inspection 与 counters 只存在于本次 GraphState；Provider client、AbortSignal、writer、Prisma、API Key 和 raw Error 留在 runtime context。

不复用 Tasklist `AgentRun`、`AgentInterrupt`、PostgresSaver 或 resume route。

**Rationale**

- Tasklist `AgentRun` 强制包含 version plan、HITL 和 tasklist-specific result fields。
- Image Agent 没有暂停/恢复点；引入 checkpoint 没有产品收益。
- 独立 GraphState 避免双状态和不相关字段。

**Alternatives Rejected**

- 让 Tasklist AgentRun 字段 nullable 并做多态：本版会演化成 Agent 平台重构。
- memory checkpointer：仍引入无用的 resume 语义。
- 用普通函数串联：难以表达一次 revision 的条件边和可测试状态约束。

## Decision 5: StreamRun Reuse + Narrow ImageGenerationRun

**Decision**

继续使用 `StreamRun/StreamEvent` 承担：

- idempotency
- public event replay
- run-scoped cancellation
- owned session
- terminal state

新增 `ImageGenerationRun` 保存窄领域业务元数据：

- public brief summary
- stage/counters
- safe failure
- server-private temporary provider URL
- safe image metadata
- active session lease

**Rationale**

- `StreamRun` 已是 transport/recovery 事实源，但不应塞入 provider-specific URL。
- 图片 route 需要在另一个 HTTP 请求中读取 server-private URL。
- PostgreSQL metadata 能在 route 与 executor 之间建立稳定、安全边界；图片 bytes 仍不持久化。

**Alternatives Rejected**

- 只用进程内 Map：当前单实例可用，但 content route、取消竞态、清理和未来多实例缺少原子事实源。
- 把 provider URL 放 StreamEvent：会下发浏览器并持久化为 public payload。
- 把图片 bytes/Base64 放数据库：违反无图片存储与 event size 边界。

## Decision 6: Atomic One-active-run Gate

**Decision**

`ImageGenerationRun.activeOwnerSessionHash` 为 active run 写入 owner hash，终态时清空；数据库对非空值做 unique constraint。创建、idempotency replay、终态和 lease 释放均通过 repository/coordinator 原子完成。

新增 `activeLeaseExpiresAt`，允许清理 crash 后遗留的 stale lease。

**Rationale**

- 前端禁用无法阻止多个并发 POST。
- “先查再插入”存在竞态。
- Prisma 可直接表达 nullable unique，比 partial index 更容易让 schema、migration 和测试一致。

**Alternatives Rejected**

- 仅前端锁：不构成服务端 invariant。
- 内存 mutex：不能跨进程，也会在重启后丢失。
- PostgreSQL partial unique index：同样可靠，但 Prisma schema 无法完整表达，维护成本更高。

## Decision 7: Safe Public Stream DTOs

**Decision**

复用 `workflow-progress-*` 展示安全阶段，并新增：

```text
image-brief
image-result-ready
```

`image-brief` 只包含只读的 `PublicImageBriefSummary`；`image-result-ready` 只包含 runId、同源 content path、temporary flag、建议文件名和安全图片元数据。

**Rationale**

- 现有 text artifact 只能承载 text，不应扩展成 media。
- 独立 chunk 对旧消费者是向后兼容的 union 增量。
- Provider URL、Prompt 和 bytes 不进入 StreamEvent。

**Alternatives Rejected**

- Markdown image：暴露 provider URL，缺少 ownership 和 expiry contract。
- Base64 chunk：可能突破 256 KiB event payload。
- 复用 artifact text：破坏现有 artifact semantics。
- 把 inspection trace 全量展示：会泄露内部执行 Prompt/思维过程。

## Decision 8: Same-origin Proxy + Single Browser Blob

**Decision**

每个 `ready` 结果都具有服务端确定的 `providerResultExpiresAt = min(reliable provider expiry, readyAt + 10 minutes)`；provider 未给出可靠 expiry 时使用 ready 后 10 分钟。content lookup 在使用 URL 前强制逻辑过期；repository 在新任务获取和结果查询的正常路径执行有界、幂等清理，原子地把到期结果标记为 `expired` 并置空 provider URL。本版沿用现有 opportunistic bounded cleanup 风格，不新增 scheduler。

结果路径：

```text
server-private provider URL
→ GET /api/chat/runs/{runId}/image
→ bounded in-memory validation
→ browser Blob
→ one object URL for preview and download
```

代理校验 owner、run status、expiry、HTTPS、host allowlist、redirect、Content-Length、actual size、MIME 和 magic bytes。浏览器 unmount/cancel/replace 时 abort fetch 并 revoke object URL。

**Rationale**

- 不需要 OSS、S3、volume 或本地文件。
- 避免 CORS、跨域 download 行为和 provider URL 暴露。
- 浏览器拿到 Blob 后，即使 provider URL 随后过期，当前页面仍可下载已加载结果。

**Alternatives Rejected**

- 浏览器直接 `<img src=providerUrl>`：Provider URL 暴露，下载/CORS 不稳定。
- 容器临时目录：形成错误的伪持久化，并受重启影响。
- 预览和下载分别 fetch：产生重复外部读取和不一致风险。

## Decision 9: Cancellation Is Local and Terminal

**Decision**

停止复用当前 StreamExecutionCoordinator：

1. UI 立即停止 reader 并展示 cancelling/cancelled。
2. server 写 `cancelRequestedAt` 并 abort run-scoped signal。
3. Provider fetch 接收该 signal。
4. Provider 返回后、保存结果前和发 ready 前再次校验取消。
5. 迟到结果丢弃，cancelled 不得转 completed。

**Rationale**

图片同步接口没有适用于本次调用的 provider task cancellation contract。HTTP abort 只能 best-effort，不能承诺服务端停止推理或不计费。

**Alternatives Rejected**

- 停止后继续展示迟到图片：违反已确认需求。
- 自动重试：状态不明确时可能第二次生图。
- 调用视频任务取消 API：资源类型不匹配。

## Decision 10: Minimal Provider Request and Safe Error Map

**Decision**

首版请求仅使用专属接口 smoke 已确认的字段。目标最小形态：

```json
{
    "model": "doubao-seedream-5.0-lite",
    "prompt": "<internal optimized prompt>",
    "size": "<confirmed default>",
    "sequential_image_generation": "disabled",
    "response_format": "url"
}
```

不发送 reference image、group options、provider prompt optimizer、stream、guidance、tools 或 output format 等未验证/非本版字段。

公共错误映射至少覆盖：

| Provider/Runtime                       | Public code                       | Retry behavior   |
| -------------------------------------- | --------------------------------- | ---------------- |
| input/output safety rejection          | `IMAGE_PROVIDER_CONTENT_REJECTED` | 不自动重试       |
| 401/403                                | `IMAGE_PROVIDER_AUTH_FAILED`      | 不自动重试       |
| 429                                    | `IMAGE_PROVIDER_BUSY`             | 新任务可稍后重提 |
| 5xx/network                            | `IMAGE_PROVIDER_UNAVAILABLE`      | 本任务不自动重试 |
| application timeout/ambiguous response | `IMAGE_GENERATION_AMBIGUOUS`      | 不自动重试       |
| invalid URL/body                       | `IMAGE_PROVIDER_INVALID_RESULT`   | 不自动重试       |

**Rationale**

- 保证单图、一次实际调用。
- AI Mind 已做 Prompt 优化，不应再启动 Provider 隐式优化。
- 安全拒绝不能触发自动改写以绕过审核。

## Decision 11: Slightly Elevated but Bounded Planning Model Budget

**Decision**

每次 ImageBrief、PromptInspection 或 revision 输出只允许一次严格结构解析。schema-invalid 输出仍消耗当前 planning call，并立即映射为 `IMAGE_PROMPT_PLANNING_FAILED`；不使用模型执行 JSON/schema repair，不自动重试，也不进入图片生成。每个节点在发起调用前检查全局计数，达到 5 后仍需规划调用时使用相同错误安全终止。

设置 `maxPlanningModelCalls = 5`：

- 正常直通路径：ImageBrief、Prompt draft、Prompt inspection，共约 3 次。
- 发生一次可修订问题：再增加 revise 和 reinspect，最多 5 次。
- 不允许任何节点把该计数器重置或形成隐式循环。

该上限比正常路径多一些，但与本版一次修订的图结构严格对应；它不增加实际图片生成次数。

**Rationale**

- 给一次 ReAct-style 修订留出完整规划空间。
- 用统一全局计数器阻止模型输出异常导致的隐藏循环。
- 不做成本预估，但仍需要控制延迟和请求行为。

**Alternative Rejected**

- `maxPlanningModelCalls = 3`：无法容纳一次完整 revise/reinspect 路径。
- 开放式或按节点无限重试：无法保证任务时延和可测试性。

## Decision 12: Server Config Module for Fixed Provider Values

**Decision**

模型和 Agent Plan endpoint 放在服务端 `image-provider-config.ts` 中集中维护：

```text
model: doubao-seedream-5.0-lite
endpoint: https://ark.cn-beijing.volces.com/api/plan/v3/images/generations
```

只有 API Key 继续使用服务端 Secret env `AI_MIND_DOUBAO_API_KEY`。模型和 endpoint 不放 env，不接受客户端覆盖，也不进入模型选择器。

**Rationale**

- 满足“配置可读取但产品值固定”的要求。
- 避免 endpoint 在多个 provider/route 中散落。
- Secret 和非 Secret 配置边界清晰。

## Decision 13: Compose Existing shadcn/ui Primitives

**Decision**

组件组合同时承担明确的 accessibility contract：图片 `alt` 仅由公开 ImageBrief 字段生成；下载控件可键盘访问且有明确名称；loading/completed 使用 polite status semantics，错误复用 `Alert`，状态变化不强制抢占焦点。

图片展示不引入第三方图片组件，组合项目已有的 shadcn/ui primitives，并补充官方 `AspectRatio` primitive：

| UI responsibility               | shadcn composition                                 |
| ------------------------------- | -------------------------------------------------- |
| ImageBrief read-only summary    | `Card` + `Badge`                                   |
| Image preview frame             | `AspectRatio` + project image rendering convention |
| Loading                         | `Skeleton`                                         |
| Provider/temporary result error | `Alert`                                            |
| Download                        | `Button`                                           |
| Temporary label                 | `Badge` / `CardDescription`                        |

阶段进度继续复用现有 `WorkflowProgressPanel`。

**Rationale**

- 项目已有 `Card`、`Skeleton`、`Alert`、`Badge`、`Button`；`AspectRatio` 是唯一需要通过 shadcn CLI 添加的官方 primitive，符合“existing components first”。
- shadcn 官方示例提供了 `AspectRatio + Image`、`Card`、`Skeleton`、`Alert` 的组合方式。
- 组件只承载展示和 Blob 生命周期，不承载 Agent 决策。

**Alternatives Rejected**

- 新增图片画廊或媒体组件库：超出单图预览/下载范围。
- 自定义状态卡片：重复已有 Card/Alert/Skeleton 能力。

## Decision 14: Split Server Timing from End-to-End Preview SLO

**Decision**

120 秒的产品 SLO 从服务端接受合法 `/image` 请求开始，到当前页面完成同源内容读取、Blob 创建并收到图片 `load` 成功结束，包含规划、Seedream、代理读取和浏览器解码。服务端另行记录 StreamRun 创建到 `image-result-ready`/terminal 的各阶段与总耗时，用于定位瓶颈；自动化测试验证计时边界与超过 120 秒时的可见状态，单次真实 smoke 只记录样本，不能证明 95th percentile。

**Rationale**

- 用户感知的是“提交到看见图片”，只记录 Provider 或服务端耗时会漏掉代理读取与解码。
- 服务端阶段指标仍然必要，否则端到端超时无法区分规划、Provider 与内容代理瓶颈。
- 95% 目标需要持续样本；发布前单次 smoke 只能验证链路与记录样本。

## Official Reference Notes

火山方舟公开 `ImageGenerations` 文档可作为字段含义和通用错误码的参考，但本项目的地址与模型以用户确认的 Agent Plan 专属契约为准：

- [ImageGenerations API](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)
- [Ark API Overview](https://api.volcengine.com/api-docs/view/overview?serviceCode=ark)
- [Seedream Prompt Guide](https://www.volcengine.com/docs/82379/1829186)

公开文档没有构成本项目专属 endpoint 的替代决策。

## Resolved Unknowns

- **Model**: fixed `doubao-seedream-5.0-lite`.
- **Endpoint**: fixed Agent Plan URL `https://ark.cn-beijing.volces.com/api/plan/v3/images/generations`.
- **Entry**: explicit `/image`.
- **HITL**: none.
- **Prompt revision**: at most one.
- **Actual generation**: at most one.
- **Binary storage**: none.
- **Result delivery**: same-page preview/download via controlled proxy and Blob.
- **Expired URL cleanup**: logical expiry on every read plus bounded opportunistic atomic scrubbing.
- **Planning parse failure**: consumes the current call and fails without repair/retry/generation.
- **Accessibility**: safe alt, keyboard-named download and semantic non-focus-stealing statuses.
- **Latency**: accepted request to successful image load; server stages measured separately.

## Implementation Smoke Unknowns

这些项目不改变方案，只决定 adapter 的精确字段与安全阈值：

1. 专属接口是否接受目标最小 request。
2. 默认 size/ratio 的精确取值。
3. 成功响应 data schema 和单图数量。
4. provider request ID 所在 header/body。
5. 临时 URL host、redirect、MIME、size 和 expiry。
6. 安全拒绝、鉴权、配额、5xx 的真实 error schema。
7. AbortSignal 后本地 fetch 的表现。
