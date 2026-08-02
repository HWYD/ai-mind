# ADR-0016：受控图像生成 Agent

状态：Accepted  
日期：2026-08-01

## 背景

AI Mind 需要一个可直接验证 Agent 边界的生图链路，但首版不应演变为通用图像工作台或开放式多轮自治 Agent。图像生成具有外部副作用、临时 URL 与二进制内容等额外安全边界，因此不能直接复用普通聊天、Tool Calling 或前端直连 Provider 的路径。

## 决策

- 只接受首个非空白 token 为 `/image` 的显式入口；普通“帮我画图”仍走普通聊天。
- 使用独立的 LangGraph `StateGraph` 运行 ImageBrief、提示词草拟、检查和最多一次修正。图只保存可序列化领域状态，不保存 Provider client、Prompt 输出、密钥、writer 或 Prisma client。
- 图像模型固定为 `doubao-seedream-5.0-lite`，固定 Agent Plan endpoint 仅由服务端配置模块持有；继续复用现有 `AI_MIND_DOUBAO_API_KEY`，不新增客户端或图片专用 secret。
- 单次 run 只允许一次图像生成、最多五次规划模型调用和最多一次提示词修正。结构化输出校验失败直接安全失败，不做隐藏的模型修复或重试。
- 不启用 checkpoint、resume、HITL 或多 Agent 协作。该图的职责是受控规划，不是可恢复的通用工作流。
- Provider 返回的临时 URL 只保存在受所有权保护的服务端记录中。浏览器仅接收同源内容路径、过期时间、尺寸和 MIME 等安全元数据，并通过同源代理读取预览/下载字节。
- 图像进度使用既有 `workflow-progress-*` 与新的安全 image chunks；阶段与总耗时允许进入公开流，但内部 Prompt、检查细节、Provider URL、图片字节、密钥和原始错误不得进入流或浏览器快照。

## 后果

正向影响：

- `/image` 具备独立的限额、取消、幂等和临时内容安全边界。
- LangGraph 显式表达 pass/revise/block 分支，避免手写顺序 runner 随分支增长而失控。
- 前端可展示 ImageBrief、进度、临时预览和下载，而不获得敏感 Provider 信息。

代价与限制：

- 首版仅支持单张文生图；编辑、局部重绘、扩图、去背景、参考图和多图均明确拒绝。
- 不提供 Prompt 编辑、人工确认、自动重试、成本估算、OSS/对象存储、历史结果恢复或长期图片保存。
- Stream 的可恢复性不等于 Provider 调用可恢复；进程崩溃后不会续跑或重复图像生成。

## 备选方案

- 直接在普通聊天模型中生成 Prompt 并调用 Provider：分支、限额和敏感数据边界难以独立审计。
- 前端直接读取 Provider URL：会泄露临时签名 URL，且无法实施所有权、MIME、大小和重定向校验。
- 使用开放 ReAct 循环或 HITL：超出首版“最多一次自动修正、无人工确认”的范围。

## 相关文档

- [Image Generation Agent Architecture](../architecture/image-generation-agent.md)
- [Stream Recovery Architecture](../architecture/stream-recovery.md)
- [v0.4.12 version document](../versions/v0.4.12-image-generation-agent.md)
