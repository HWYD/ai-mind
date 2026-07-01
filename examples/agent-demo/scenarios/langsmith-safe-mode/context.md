# Context: LangSmith Safe Mode

状态: Final
版本: v1.0
日期: 2026-07-01
场景ID: langsmith-safe-mode

## Product Context

### 产品定位

- LangSmith 是可选的观测性增强组件，非核心业务组件
- 核心业务流程（Agent 执行）优先级高于一切
- 观测性降级是可接受的，Agent 失败是不可接受的
- 用户对 tracing 缺失的敏感度远低于 Agent 不可用

### 设计原则

- 观测性永远不应该阻塞业务
- 失败时优雅降级，而非报错退出
- 日志可审计但不暴露敏感信息
- 保持正常情况下的原有行为不变

### 用户体验目标

- 用户感知不到观测性组件的失败
- 只有维护者能通过日志发现降级
- 正常配置下用户体验完全不变

## Technical Context

### 技术栈

- LangChain Tracer 体系
- LangSmith Client SDK
- Node.js Console Logger
- TypeScript 类型系统

### 现有架构

```
Tasklist Agent Runtime
  ├── Agent Graph Executor
  ├── Observer Factory (本任务修改)
  │   ├── LangSmith Observer (现有)
  │   └── Noop Observer (新增)
  └── Runtime Logger
```

### 现有问题

- Observer Factory 初始化失败时抛出异常
- LangSmith emit 失败时向上冒泡异常
- 日志可能包含完整 API Key 和堆栈
- 无统一的降级策略

## Module Map

| 模块名称                                            | 职责                  | 改动范围                |
| --------------------------------------------------- | --------------------- | ----------------------- |
| `apps/webapp/lib/ai/observer/observer-factory.ts`   | Observer 创建与初始化 | ✅ 增加异常捕获与降级   |
| `apps/webapp/lib/ai/observer/noop-observer.ts`      | 空实现 Observer       | ✅ 新增文件             |
| `apps/webapp/lib/ai/observer/langsmith-observer.ts` | LangSmith 实现        | ✅ 增加 emit 异常捕获   |
| `apps/webapp/lib/ai/observer/types.ts`              | Observer 类型定义     | ❌ 不修改               |
| `apps/webapp/lib/ai/runtime/tasklist-agent.ts`      | Tasklist Agent 运行时 | ❌ 不修改（仅被动适配） |

## Interface Contracts

### 输入契约

- Observer Factory 接收与原来相同的配置参数
- 不新增配置项，保持向后兼容
- 不修改 Observer 接口定义
- 不修改 Agent Runtime 调用方式

### 输出契约

- 初始化永不抛出异常（即使失败也返回 NoopObserver）
- emit 方法永不抛出异常
- 日志输出符合脱敏规范
- Agent Run Status 不受 observer 影响

### 兼容性保证

- 正常配置下行为完全不变
- 新增代码对正常路径零侵入
- 类型系统保持兼容
- 可随时回滚而不影响功能

## Constraints

### 技术约束

- 不修改 Observer 公开接口
- 不修改 Agent Run Status 枚举
- 不新增 npm 依赖
- 不修改现有的成功路径代码

### 设计约束

- NoopObserver 必须实现完整 Observer 接口
- 所有异常必须在 observer 层内部消化
- 日志格式统一，便于 grep
- 降级决策必须是幂等的

### 安全约束

- API Key 日志脱敏（仅显示后 4 位）
- 用户数据绝不写入日志
- 堆栈信息截断或省略
- 不记录网络请求详情

## Resource Boundary

### 允许访问的资源

- ✅ `apps/webapp/lib/ai/observer/` 目录下的文件
- ✅ 现有 Logger 接口
- ✅ process.env 读取配置（只读）

### 禁止访问的资源

- ❌ 真实 LangSmith 服务器（测试时 mock）
- ❌ 数据库或持久化存储
- ❌ `packages/stream-core/` 协议定义
- ❌ Agent Graph 拓扑结构
- ❌ 用户会话数据

## Non-functional Requirements

### 性能

- 降级逻辑的性能开销 < 1ms
- 正常路径无额外性能损失
- NoopObserver 的方法调用开销可忽略

### 可靠性

- 初始化成功率 100%（即使配置错误）
- emit 失败率不影响 Agent 成功率
- 降级后无副作用

### 可观测性

- 降级事件必须有明确日志
- 日志级别合理（WARN 而非 ERROR）
- 日志包含错误代码便于搜索

### 可测试性

- 支持通过环境变量控制测试场景
- 支持 mock LangSmith 客户端
- 支持断言日志输出
