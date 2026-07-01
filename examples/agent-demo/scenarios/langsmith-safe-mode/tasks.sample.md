# Sample Tasks: LangSmith Safe Mode

状态: Sample
版本: v1.0
日期: 2026-07-01
场景ID: langsmith-safe-mode
任务总数: 9

## Task Decomposition

### T1: 创建 NoopObserver 实现

**优先级**: P0  
**依赖**: 无  
**预估工时**: 45min  
**风险等级**: 低

**任务描述**:

- 在 `apps/webapp/lib/ai/observer/` 下创建 `noop-observer.ts`
- 实现完整的 Observer 接口
- 所有方法均为空实现
- 添加类型注解和 JSDoc 注释

**验收要点**:

- [ ] TypeScript 编译无错误
- [ ] 实现了 Observer 接口的所有方法
- [ ] 所有方法无副作用
- [ ] 代码注释完整

**非目标保护**:

- ❌ 不添加任何业务逻辑
- ❌ 不修改现有类型定义

---

### T2: 创建日志脱敏工具函数

**优先级**: P0  
**依赖**: 无  
**预估工时**: 30min  
**风险等级**: 中

**任务描述**:

- 在 `langsmith-observer.ts` 或新增 `sanitize.ts` 中添加脱敏函数
- 实现 `sanitizeError(error: Error): SanitizedError`
- 实现 `sanitizeApiKey(key: string): string`（仅显示后 4 位）
- 确保不暴露用户数据和完整堆栈

**验收要点**:

- [ ] API Key 脱敏正确（仅后 4 位）
- [ ] Error 对象不包含完整 stack
- [ ] Error 对象不包含用户数据
- [ ] 边缘情况处理（空值、undefined）

**非目标保护**:

- ❌ 不实现通用的对象脱敏（仅 Error 和 API Key）

---

### T3: 创建 SafeObserver 装饰器

**优先级**: P0  
**依赖**: T2  
**预估工时**: 60min  
**风险等级**: 中

**任务描述**:

- 创建 `safe-observer.ts`
- 实现 SafeObserver 类，包装真实 Observer
- 所有方法通过 safeCall 包装，捕获异常
- 异常时输出脱敏后的 WARN 日志
- 确保不向上冒泡任何异常

**验收要点**:

- [ ] 所有 Observer 方法都被安全包装
- [ ] 内部方法异常被正确捕获
- [ ] 异常日志级别为 WARN
- [ ] 日志内容已脱敏
- [ ] 不影响正常执行流程

**非目标保护**:

- ❌ 不实现重试逻辑
- ❌ 不实现降级策略（由 Factory 负责）

---

### T4: 改造 ObserverFactory 增加降级逻辑

**优先级**: P0  
**依赖**: T1, T3  
**预估工时**: 45min  
**风险等级**: 高

**任务描述**:

- 修改 `observer-factory.ts`
- 配置缺失时直接返回 NoopObserver
- 初始化代码包裹在 try-catch 中
- 初始化失败时返回 NoopObserver
- 输出降级日志（包含脱敏后的错误信息）
- 确保 Factory 永不抛出异常

**验收要点**:

- [ ] 无配置时返回 NoopObserver
- [ ] 初始化异常被正确捕获
- [ ] 降级日志输出正确
- [ ] Factory 永不抛出异常
- [ ] 正常路径行为不变

**非目标保护**:

- ❌ 不修改配置验证逻辑
- ❌ 不新增配置项

---

### T5: 编写 NoopObserver 单元测试

**优先级**: P1  
**依赖**: T1  
**预估工时**: 30min  
**风险等级**: 低

**任务描述**:

- 创建 `noop-observer.test.ts`
- 测试所有方法存在且可调用
- 测试调用方法无副作用
- 测试类型兼容性

**验收要点**:

- [ ] 所有方法测试覆盖
- [ ] 测试覆盖率 100%
- [ ] 所有测试用例通过

---

### T6: 编写 SafeObserver 单元测试

**优先级**: P1  
**依赖**: T3  
**预估工时**: 45min  
**风险等级**: 中

**任务描述**:

- 创建 `safe-observer.test.ts`
- 测试所有方法的异常捕获
- 测试正常情况下调用内部 observer
- 测试异常情况下的日志输出
- 测试异常不向上冒泡

**验收要点**:

- [ ] 所有方法的异常场景都被测试
- [ ] 正常情况下内部 observer 被调用
- [ ] 异常时日志正确输出
- [ ] 异常不向上冒泡
- [ ] 测试覆盖率 ≥ 95%

---

### T7: 编写 ObserverFactory 单元测试

**优先级**: P1  
**依赖**: T4  
**预估工时**: 60min  
**风险等级**: 中

**任务描述**:

- 创建 `observer-factory.test.ts`
- 测试配置缺失场景
- 测试初始化失败场景
- 测试初始化成功场景
- 测试降级日志输出
- 测试返回的是 SafeObserver 包装

**验收要点**:

- [ ] 所有降级场景都有测试
- [ ] 正常初始化行为不变
- [ ] 降级日志正确输出
- [ ] 永不抛出异常
- [ ] 测试覆盖率 ≥ 95%

---

### T8: 集成测试与回归测试

**优先级**: P1  
**依赖**: T4, T6, T7  
**预估工时**: 60min  
**风险等级**: 中

**任务描述**:

- 在 `tasklist-agent.test.ts` 中添加集成测试
- 测试无 LangSmith 配置时 Agent 正常运行
- 测试 LangSmith 失败时 Agent 正常运行
- 测试 emit 失败不影响 Agent 结果
- 回归测试：正常配置下 tracing 功能正常
- 回归测试：HITL 流程正常
- 回归测试：Checkpoint / Resume 正常

**验收要点**:

- [ ] 所有集成测试通过
- [ ] 回归测试全部通过
- [ ] Agent 运行状态不受 observer 影响

---

### T9: 性能基准测试与文档

**优先级**: P2  
**依赖**: T8  
**预估工时**: 30min  
**风险等级**: 低

**任务描述**:

- 编写基准测试脚本
- 测试降级逻辑开销（目标 < 1ms）
- 测试 NoopObserver 调用开销（目标 < 0.1ms）
- 测试正常路径性能无下降
- 更新代码文档和注释

**验收要点**:

- [ ] 降级开销 < 1ms
- [ ] NoopObserver 开销 < 0.1ms
- [ ] 正常路径性能无明显下降
- [ ] 代码文档完整

## Recommended Execution Order

```
T1 (NoopObserver) ─┐
                    ├──> T5 (NoopObserver 测试)
T2 (脱敏工具) ──────┤
                    ├──> T3 (SafeObserver) ──> T6 (SafeObserver 测试)
                    │                       │
T4 (Factory 改造) ──┴───────────────────────┴──> T7 (Factory 测试)
                                                        │
                                                        ├─> T8 (集成测试)
                                                        │
                                                        └─> T9 (性能测试)
```

## Risk Tasks

| 任务ID | 风险描述                    | 风险等级 | 应对措施                         |
| ------ | --------------------------- | -------- | -------------------------------- |
| T4     | 改造 Factory 时影响正常路径 | 高       | 充分的回归测试 + 代码审查        |
| T3     | 遗漏某些方法导致异常逃逸    | 中       | TypeScript 类型检查 + 全方法测试 |
| T2     | 脱敏不彻底泄露敏感信息      | 中       | 代码审查 + 专项测试用例          |

## Acceptance-related Tasks

### 需求验收对应任务

| AC ID | 对应任务   |
| ----- | ---------- |
| AC1   | T4, T7, T8 |
| AC2   | T4, T7, T8 |
| AC3   | T3, T6, T8 |
| AC4   | T2, T6, T7 |
| AC5   | T8         |

## Non-goals Protection Tasks

以下任务明确不执行：

- ❌ 不实现自动重试机制
- ❌ 不实现备用 tracing 后端
- ❌ 不实现动态配置热更新
- ❌ 不实现 metrics 统计
- ❌ 不实现告警集成
- ❌ 不修改 Agent Run Status 状态机
- ❌ 不修改 HITL 流程
- ❌ 不新增数据库表或字段

## Definition of Done

- [ ] 所有 P0、P1 任务完成
- [ ] 单元测试覆盖率 ≥ 95%
- [ ] 集成测试全部通过
- [ ] 回归测试无回归
- [ ] 性能指标达标
- [ ] 代码审查通过
- [ ] TypeScript 编译零错误
- [ ] ESLint 零警告
