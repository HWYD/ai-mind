# AGENTS

## 适用范围

本文件适用于 `apps/webapp/` 下的前端、API route、AI runtime、Provider Runtime 和测试。

## 关键边界

- `route -> chat-service facade -> runtime` 是主入口，避免把 UI、Provider 或 MCP 细节反向塞进主链控制流。
- `modelId -> catalog -> provider/providerModel` 是模型选择唯一事实源。
- `modelId` 只能影响模型来源，不能影响 Agent 权限边界。
- 非法 `modelId`、未允许的 provider、缺少必要 API Key 或不支持的能力必须 fail closed。
- API Key、token、完整 provider config 只能在服务端读取和使用。
- 不要把秘密信息放进 `NEXT_PUBLIC_*`、前端 DTO、stream chunk、Graph Trace、Debug Summary 或用户可见错误。
- Provider 原始错误只允许通过脱敏日志入口输出；用户侧只接收标准化错误。

## 前端与 API 约束

- 前端请求只传允许的业务字段，不手输任意 provider、baseURL 或模型原始配置。
- API DTO 尽量保持单一契约来源；生产者和消费者不要分别手写同名结构。
- UI 展示逻辑不要偷偷承担 runtime 规则判断。
- 涉及 `app/api/**/route.ts` 的改动，优先确认错误码、响应字段和现有 stream 协议是否兼容。

## 改动前优先看

- 对应版本的 `private-folder/plans/` 和 `private-folder/tasklists/`
- `apps/webapp/lib/ai/runtime/`
- `apps/webapp/lib/ai/model-provider/`
- 如涉及 Agent：`apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/`

## 最小验证

按改动范围优先执行最小验证：

- `pnpm --dir apps/webapp lint`
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp test`

补充要求：

- 优先跑最接近改动的 targeted vitest。
- 只在明确需要自动修复时再执行 `pnpm --dir apps/webapp lint:fix`，并检查修复后的 diff。
- 改动 UI、stream 展示或交互状态时，补浏览器 smoke。

## 类型与导入

- webapp 内部类型优先从本模块公开入口导入。
- 避免深层导入 `lib/ai/model-provider`、`runtime`、`capabilities` 的内部实现文件，除非该目录没有稳定公开入口。
- 服务端专用类型不要直接穿到客户端组件。
