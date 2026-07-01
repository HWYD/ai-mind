# Sample Plan: LangSmith Safe Mode

状态: Sample
版本: v1.0
日期: 2026-07-01
场景ID: langsmith-safe-mode
方案类型: 后端可靠性增强

## Requirement Understanding

### 需求理解

本任务的核心是为 LangSmith 观测性组件实现 "安全模式"，确保即使观测性组件失败，核心 Agent 业务流程也能正常运行。这是典型的可靠性增强需求，目标是提高系统韧性，降低观测性组件对业务的影响。

### 关键要点

- **降级策略**：配置缺失或初始化失败时降级为 NoopObserver
- **异常隔离**：所有 observer 异常在内部消化，不向上冒泡
- **日志脱敏**：敏感信息必须脱敏处理
- **零侵入**：正常路径代码完全不变，仅在异常路径新增逻辑

### 用户价值

- 提高生产环境可用性，避免观测性组件导致业务中断
- 降低维护成本，减少因 tracing 问题引发的告警和排查
- 提升系统韧性，符合云原生最佳实践

## Implementation Approach

### 整体方案

采用装饰器模式 + 工厂模式的组合方案：

1. **NoopObserver**：空实现 Observer 接口，作为降级兜底
2. **SafeObserver**：装饰器，包装真实 Observer，捕获所有 emit 异常
3. **ObserverFactory**：增加 try-catch，初始化失败时返回 SafeObserver(NoopObserver)

### 方案选型理由

| 方案                       | 优点                         | 缺点                   | 选择    |
| -------------------------- | ---------------------------- | ---------------------- | ------- |
| 装饰器模式 + 工厂模式      | 零侵入、职责清晰、可测试性好 | 增加一层间接调用       | ✅ 选择 |
| 直接修改 LangSmithObserver | 代码改动少                   | 侵入原有逻辑，测试困难 | ❌ 不选 |
| 在 Agent Runtime 层捕获    | 改动范围最小                 | 污染业务层，边界不清晰 | ❌ 不选 |

### 核心设计

1. **初始化安全**：Factory 层 try-catch，永不抛出
2. **运行时安全**：SafeObserver 装饰器捕获所有 emit 异常
3. **日志统一**：所有异常通过统一的脱敏日志输出
4. **正常路径零开销**：正常初始化时不经过装饰器

## Module Changes

### 新增模块

| 文件路径                                       | 职责                 |
| ---------------------------------------------- | -------------------- |
| `apps/webapp/lib/ai/observer/noop-observer.ts` | 空实现 Observer 接口 |
| `apps/webapp/lib/ai/observer/safe-observer.ts` | 异常捕获装饰器       |

### 修改模块

| 文件路径                                            | 改动内容                  |
| --------------------------------------------------- | ------------------------- |
| `apps/webapp/lib/ai/observer/observer-factory.ts`   | 增加 try-catch 和降级逻辑 |
| `apps/webapp/lib/ai/observer/langsmith-observer.ts` | 增加日志脱敏工具函数      |

### 不涉及模块

- ❌ `apps/webapp/lib/ai/observer/types.ts`（类型定义不变）
- ❌ `apps/webapp/lib/ai/runtime/tasklist-agent.ts`（Agent Runtime 不变）
- ❌ `packages/stream-core/`（流式协议不变）
- ❌ 数据库 schema（无持久化改动）

## Technical Design

### NoopObserver 设计

```typescript
export class NoopObserver implements Observer {
    onRunStart(): void {}
    onRunEnd(): void {}
    onLLMStart(): void {}
    onLLMEnd(): void {}
    onToolStart(): void {}
    onToolEnd(): void {}
    // ... 所有方法均为空实现
}
```

### SafeObserver 设计

```typescript
export class SafeObserver implements Observer {
    constructor(
        private readonly inner: Observer,
        private readonly logger: Logger
    ) {}

    private safeCall(method: string, fn: () => void): void {
        try {
            fn()
        } catch (error) {
            this.logger.warn(`[OBSERVER-002] ${method} failed`, {
                error: sanitizeError(error),
            })
        }
    }

    onRunStart(run: Run): void {
        this.safeCall('onRunStart', () => this.inner.onRunStart(run))
    }
    // ... 所有方法都通过 safeCall 包装
}
```

### ObserverFactory 改造

```typescript
export function createObserver(config: ObserverConfig): Observer {
    if (!config.langsmithEnabled) {
        return new NoopObserver()
    }

    try {
        const realObserver = createLangSmithObserver(config)
        return new SafeObserver(realObserver, logger)
    } catch (error) {
        logger.warn('[OBSERVER-001] LangSmith init failed, using no-op', {
            error: sanitizeError(error),
            apiKeySuffix: config.apiKey?.slice(-4) || 'none',
        })
        return new NoopObserver()
    }
}
```

### 脱敏工具函数

```typescript
function sanitizeError(error: Error): SanitizedError {
    return {
        message: error.message,
        name: error.name,
        // 不包含 stack 或仅包含前几行
    }
}
```

## Non-goals

### 明确不做的功能

1. ❌ 不实现自动重试机制（失败就降级，不重试）
2. ❌ 不实现备用 tracing 后端（仅 Noop）
3. ❌ 不实现动态配置热更新
4. ❌ 不实现 metrics 统计（降级次数统计）
5. ❌ 不实现告警集成（降级自动告警）
6. ❌ 不修改 LangSmith SDK 本身
7. ❌ 不新增其他 Observer 实现

### 明确不涉及的范围

1. ❌ 不修改 Agent Run Status 状态机
2. ❌ 不修改 HITL 流程
3. ❌ 不修改 Checkpoint / Resume 机制
4. ❌ 不修改流式输出协议
5. ❌ 不新增数据库表或字段

## Risks and Mitigations

| 风险                      | 影响 | 概率 | 应对措施                       |
| ------------------------- | ---- | ---- | ------------------------------ |
| 装饰器影响性能            | 低   | 中   | 基准测试验证开销 < 1ms         |
| 日志脱敏不彻底            | 高   | 低   | 代码审查 + 单元测试覆盖        |
| 异常吞掉导致问题难排查    | 中   | 中   | 统一错误代码 + 足够上下文      |
| 正常路径行为改变          | 高   | 低   | 回归测试覆盖 + 对比测试        |
| NoopObserver 遗漏接口实现 | 中   | 低   | TypeScript 类型检查 + 单元测试 |

## Testing Strategy

### 单元测试

- ✅ NoopObserver 实现完整接口
- ✅ SafeObserver 捕获所有异常
- ✅ ObserverFactory 配置缺失时降级
- ✅ ObserverFactory 初始化失败时降级
- ✅ 日志脱敏正确（API Key 仅显示后 4 位）
- ✅ 异常不向上冒泡

### 集成测试

- ✅ Tasklist Agent 在无 LangSmith 配置时正常运行
- ✅ Tasklist Agent 在 LangSmith 失败时正常运行
- ✅ emit 失败不影响 Agent 执行结果
- ✅ 降级日志正确输出

### 回归测试

- ✅ 正常配置下 LangSmith tracing 功能正常
- ✅ HITL 流程正常
- ✅ Checkpoint / Resume 功能正常
- ✅ 性能无明显下降

### 边界测试

- ✅ API Key 为空字符串
- ✅ API Key 无效格式
- ✅ 网络超时模拟
- ✅ 部分 emit 失败
- ✅ 连续多次 emit 失败

## Acceptance Criteria Suggestions

基于方案设计，建议补充以下验收标准：

### 补充 AC6: 性能指标

- [ ] 降级逻辑开销 < 1ms
- [ ] 正常路径无额外性能开销
- [ ] NoopObserver 方法调用开销 < 0.1ms

### 补充 AC7: 类型安全

- [ ] TypeScript 编译无错误
- [ ] NoopObserver 实现完整 Observer 接口
- [ ] 无 any 类型使用

### 补充 AC8: 可测试性

- [ ] 所有降级场景都有对应单元测试
- [ ] 支持 mock LangSmith 客户端
- [ ] 支持断言日志输出

## Implementation Checklist

- [ ] 创建 NoopObserver 实现
- [ ] 创建 SafeObserver 装饰器
- [ ] 实现日志脱敏工具函数
- [ ] 改造 ObserverFactory 增加降级逻辑
- [ ] 编写单元测试（覆盖率 ≥ 95%）
- [ ] 编写集成测试
- [ ] 性能基准测试
- [ ] 回归测试（正常配置场景）
- [ ] 代码审查
- [ ] 本地验证
