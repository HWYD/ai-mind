# AGENTS

## 适用范围

本文件适用于 `packages/stream-core/` 下的协议、适配器、构建和测试。

## 协议约束

- `stream-core` 是共享协议层，不要把 webapp 专属业务语义直接塞进公共包。
- 新增或修改 stream chunk、错误码、协议字段时，先判断是否会影响现有消费者兼容性。
- 兼容性要求高于局部实现方便性；不清楚影响面时，先补测试再改结构。
- 错误码、事件字段和导出路径一旦对外可见，就按公共契约看待。

## 改动前优先看

- `packages/stream-core/src/protocol/`
- `packages/stream-core/package.json`
- 被 webapp 消费的适配层与相关测试

## 最小验证

- `pnpm --filter @ai-mind/stream-core test`
- `pnpm --filter @ai-mind/stream-core build`
- `pnpm --filter @ai-mind/stream-core typecheck`

如果协议字段变了，再补消费端测试，至少确认 webapp 侧没有跟着漂移。
