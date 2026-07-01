# Requirement: LangSmith Safe Mode

状态: Final
版本: v1.0
日期: 2026-07-01
场景ID: langsmith-safe-mode

## User Story

作为 AI Mind 维护者，我希望当 LangSmith tracing 配置缺失或初始化失败时，Tasklist Agent 仍能正常运行，这样可以避免观测性组件影响核心业务流程，提高系统韧性。

## Background

### 业务背景

- LangSmith 是 AI Mind 的可选观测性组件，用于追踪 LLM 调用
- 生产环境可能因网络问题、API Key 过期或配置错误导致 LangSmith 初始化失败
- 核心业务流程（Agent 执行）的优先级高于观测性数据收集
- 需要保证即使观测性失效，主流程仍然可用

### 技术背景

- 当前 observer 设计假设 LangSmith 总是可用
- 初始化失败可能导致整个 Agent 运行失败
- tracing emit 失败也可能中断执行
- 需要建立 fail-soft 机制而非 fail-hard

## Detailed Description

### 功能描述

实现 LangSmith 观测性组件的 "安全模式"：

- 配置缺失时：自动降级为 no-op observer
- 初始化失败时：记录 warning，继续使用 no-op observer
- 运行时 emit 失败时：记录 warning，不中断主流程
- 所有失败信息脱敏处理，不暴露敏感配置

### 降级策略

```
正常流程：
  Agent 启动 → LangSmith 初始化成功 → 正常追踪

安全模式流程：
  Agent 启动 → LangSmith 初始化失败
    → 记录 warning 日志
    → 创建 NoopObserver
    → Agent 正常执行（无追踪）
```

### 日志规范

- 初始化失败：`[OBSERVER-001] LangSmith initialization failed, using no-op observer`
- 运行时失败：`[OBSERVER-002] Failed to emit trace, continuing execution`
- 日志级别统一为 WARN，不使用 ERROR
- 日志中不含 API Key、完整堆栈、用户数据

## Acceptance Criteria

### AC1: 配置缺失时降级

- [ ] 未设置 LANGCHAIN_API_KEY 时，Agent 正常启动
- [ ] 未设置 LANGCHAIN_TRACING_V2 时，Agent 正常启动
- [ ] 配置缺失时，记录降级 warning 日志
- [ ] 降级后使用 NoopObserver

### AC2: 初始化失败时降级

- [ ] API Key 无效时，Agent 正常启动
- [ ] 网络超时导致初始化失败时，Agent 正常启动
- [ ] 初始化失败时，记录降级 warning 日志
- [ ] 降级后使用 NoopObserver

### AC3: 运行时失败不中断

- [ ] 单次 emit 失败不影响后续执行
- [ ] emit 失败时，记录 warning 日志
- [ ] emit 失败不改变 Agent 运行状态
- [ ] emit 失败不影响最终执行结果

### AC4: 日志脱敏

- [ ] 日志中不包含完整 API Key（仅显示后 4 位）
- [ ] 日志中不包含用户输入或输出内容
- [ ] 日志中不包含完整堆栈信息
- [ ] 日志中不包含网络请求详情

### AC5: 无功能回归

- [ ] 正常配置下 LangSmith tracing 功能正常
- [ ] Tasklist Agent 功能不受影响
- [ ] HITL 流程不受影响
- [ ] Checkpoint / Resume 功能不受影响
