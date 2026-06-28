# Decisions 020：v0.2.0 Baseline

状态：Released Baseline
版本：v0.2.0
归档日期：2026-06-28

## 核心决策

### 1. LangGraph 只替换编排层，不扩张 Agent 权限

`v0.2.0` 接入 LangGraph 的目标是把既有受控流程表达得更显式，而不是让 Agent 变成通用自主系统。

### 2. 保留 legacy runner 作为迁移期止损，但不保留两套业务规则

legacy / graph 是两种编排实现，不是两套产品逻辑。共享 steps、shared guard 和 limits 是当时的重要工程纪律。

### 3. runtime 选择只在服务端配置，前端不暴露切换能力

用户不需要理解底层编排差异；发布风险控制应由服务端配置承担。

### 4. 不允许 graph 运行到一半自动 fallback

中途切换会破坏 stream、trace、artifact 和 run 语义一致性，因此只允许请求开始前择一路径执行。

### 5. graph events 只输出 AI Mind 自己的产品化协议

不直透 LangGraph 原始 debug event，也不输出完整 state、prompt 或 raw output。

### 6. GraphState 在本版不是单事实源

`v0.2.0` 的 GraphState 仍是对既有 AgentState 的 graph 包装层。真正的单状态模型收口是后续版本工作，不属于本版。

### 7. checkpoint 只做开发态能力

memory checkpoint 的价值是帮助调试、理解 node / route / patch，不代表产品支持 resume、replay 或历史恢复。

## 后续影响

这些决策直接铺垫了后续演进路径：

- `v0.2.3` 收口为 graph-only runtime
- `v0.2.4` 收口为 GraphState 单事实源
- `v0.3.0` 才在此基础上继续进入 HITL / durable checkpoint / resume
