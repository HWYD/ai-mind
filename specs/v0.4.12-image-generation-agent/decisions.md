# Decisions: Image Generation Agent v0.4.12

## D-001 Explicit Entry and Scope

生图只通过显式 `/image` 入口触发。普通聊天不自动猜测生图意图，也不进入
Image Agent。v0.4.12 只交付文本生图链路；编辑、局部重绘、扩图、去背景、参考图、
多图和专业图像工具链作为能力边界返回安全提示，不进入 provider 调用。

## D-002 Fixed Structured-Planning Model

ImageBrief、Prompt draft、Inspection 和 Revision 的结构化输出统一固定使用
`deepseek/deepseek-v4-pro`，由服务端通过 model catalog 解析，关闭 reasoning、
streaming 和隐式重试。它不跟随用户在聊天输入框选择的模型；这样可以避免模型选择
造成 schema 解析漂移。`maxPlanningModelCalls = 5`，`maxPromptRevisions = 1`，
每次规划调用只做一次严格 structured parse。

## D-003 Fixed Image Provider

实际图片模型固定为 `doubao-seedream-5.0-lite`，固定 Agent Plan endpoint 为
`https://ark.cn-beijing.volces.com/api/plan/v3/images/generations`。两项是服务端
配置事实，不新增环境变量、不允许客户端覆盖、不运行时学习 host。鉴权复用已有的
`AI_MIND_DOUBAO_API_KEY`。

## D-004 Controlled Graph without HITL

Image Agent 使用 LangGraph `StateGraph` 表达 brief、draft、inspection、single
revision、generation 和 terminal routes。v0.4.12 不使用 HITL、不使用 checkpointer，
不做自动多轮重画；取消和终态由现有 stream execution/coordinator 机制负责。

## D-005 Safe Stream Contract

公共流只允许 bounded `PublicImageBriefSummary`、阶段状态、稳定错误码和带服务端
`expiresAt` 的 `image-result-ready`。内部 Prompt、provider URL、Base64、API Key、
GraphState 和原始 provider error 不进入 stream、持久化快照或浏览器 DTO。

## D-006 Temporary Content Delivery

不引入 OSS、对象存储或图片字节持久化。provider 返回的临时 HTTPS URL 只保存在服务端
受控 run 中；浏览器通过当前会话拥有权校验的同源 content route 读取一次，服务端执行
精确 host allowlist、15 秒 timeout、20 MiB 上限、MIME/magic 校验和安全响应头。前端
以 Blob URL 完成预览和下载，并在清理/取消/替换时 revoke。

## D-007 Lease, Idempotency and Cancellation

同一会话最多一个活动 image run；相同原始消息重放原 run，不重复调用 provider。生成计数
在 provider 调用前原子地从 0 变为 1。取消后禁止 ready publish、禁止 late result 覆盖
取消终态并释放 lease；过期或 stale lease 清理不恢复、不重复生成。

## D-008 Timing and Evidence

端到端时长从服务端接受合法 `/image` 开始，到浏览器同源读取、Blob 创建并完成图片
`load` 结束。服务端仅输出安全的阶段/总耗时，120 秒边界由确定性测试验证；一次真实
smoke 只用于确认链路和记录样本，不能宣称 95th percentile SLO。

## D-009 Compatibility and Release

协议、数据库迁移和 UI 都采用增量方式，普通聊天和既有 Agent 链路保持向后兼容。
发布资料同步 `specs`、ADR、architecture、README、version/release/tasklist 和
package version `0.4.12`；历史版本文档不批量改写。

## D-010 Dedicated Image Daily Quota

生图每日配额与普通聊天限流隔离：同一 Session 默认每日 3 个被接受的新 `/image` 任务；同一 IP 默认每日 10 个作为防刷上限，部署时可在 10–20 范围内调整。无效请求、幂等重放和活动任务冲突不计数，已接受任务后续失败仍计数。由于本版本没有登录体系，Session Cookie 是产品配额身份，IP 是共享网络防刷边界；继续使用当前进程内存限流，不在本次小需求引入 Redis/KV。
