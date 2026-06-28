# ADR-0003：Stream-core Backward Compatibility

状态：Accepted
日期：2026-06-27

## 背景

`@ai-mind/stream-core` 是 AI Mind 的共享 stream protocol 基础设施，承载 text、reasoning、tool/resource/prompt facts、graph events、artifact、error、interrupt 和 resume chunks。

前端 reducer 和 UI panels 依赖 stream chunk 兼容性。

## 决策

`stream-core` 是稳定协议层。新增 chunk 必须是增量式、向后兼容的，除非版本方案明确批准破坏性变更。

## 影响

- stream protocol 变化必须补 stream-core schema tests。
- NDJSON writer 行为必须验证。
- webapp chunk schema、reducer 和 UI consumption tests 必须同步。
- public chunks 不得输出 raw GraphState、raw checkpoint、raw provider error、API key、session cookie、provider config 或 internal prompt。

## 备选方案

让每个 runtime feature 自己定义 app-local stream event。这个方案被放弃，因为会让前端消费分裂，回归更难发现。

为了调试输出 raw graph/debug payload。这个方案被放弃，因为违反 public DTO safety。

## 后续事项

未来 artifact editing、Run History 或 replay 功能必须保持既有 stream consumers 兼容，或提供明确的版本化兼容方案。
