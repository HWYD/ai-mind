# Sample Plan: Delivery Chain Resource Boundary

状态: Sample
版本: v1.0
日期: 2026-07-01
场景ID: delivery-chain-resource-boundary
方案类型: 安全边界增强

## Requirement Understanding

### 需求理解

本任务的核心是为 Delivery Chain 功能建立严格的资源访问边界，确保公开 demo 只能访问预先准备好的示例 corpus，不能访问真实项目文件。这是一个典型的安全增强需求，需要实现多层防御、白名单机制和路径安全验证。

### 关键要点

- **白名单机制**：只允许 `@demo://` scheme
- **多层验证**：Picker 层 + Resolver 层 + Scheme Validator + Path Validator
- **路径安全**：防止路径遍历、符号链接攻击
- **错误脱敏**：拒绝时不泄露敏感信息
- **零侵入**：不影响非 demo 功能

### 用户价值

- 防止 demo 功能意外泄露项目源码
- 防止路径遍历攻击获取敏感文件
- 确保 demo 环境的"沙箱"隔离
- 符合安全开发生命周期（SDL）要求

## Implementation Approach

### 整体方案

采用四层防御架构，从 UI 层到逻辑层层层设防：

1. **Scheme Validator**：验证 URI scheme 白名单
2. **Path Validator**：规范化路径，检测遍历攻击
3. **Demo Resolver**：只解析 demo corpus 内的文件
4. **Resource Picker**：UI 层只展示允许的文件

### 方案选型理由

| 方案               | 优点               | 缺点           | 选择    |
| ------------------ | ------------------ | -------------- | ------- |
| 四层防御架构       | 深度防御、容错性强 | 代码略多       | ✅ 选择 |
| 仅 Resolver 层验证 | 改动少             | 单点失效风险高 | ❌ 不选 |
| 仅 Picker 层限制   | 用户体验好         | UI 层容易绕过  | ❌ 不选 |

### 核心设计

1. **纯函数验证**：所有验证逻辑都是纯函数，易于测试
2. **规范化优先**：先规范化路径，再进行验证
3. **Fail-closed**：任何验证失败都默认拒绝
4. **错误统一处理**：所有拒绝返回相同的错误消息，避免信息泄露

## Module Changes

### 新增模块

| 文件路径                                           | 职责                      |
| -------------------------------------------------- | ------------------------- |
| `apps/webapp/lib/ai/resources/scheme-validator.ts` | Scheme 白名单验证         |
| `apps/webapp/lib/ai/resources/path-validator.ts`   | 路径安全验证              |
| `apps/webapp/lib/ai/resources/demo-resolver.ts`    | Demo 资源解析器（增强版） |

### 修改模块

| 文件路径                                            | 改动内容                 |
| --------------------------------------------------- | ------------------------ |
| `apps/webapp/lib/ai/resources/resource-picker.ts`   | 限制数据源为 demo corpus |
| `apps/webapp/components/picker/resource-picker.tsx` | UI 层数据源限制          |
| `apps/webapp/lib/ai/commands/delivery-chain.ts`     | 注入 demo resolver       |

### 不涉及模块

- ❌ `apps/webapp/lib/ai/runtime/`（运行时不变）
- ❌ `packages/stream-core/`（协议不变）
- ❌ 数据库 schema（无持久化改动）
- ❌ Graph 拓扑结构（不变）

## Technical Design

### Scheme Validator 设计

```typescript
// 纯函数，易于测试
export function validateScheme(uri: string, allowedSchemes: string[]): boolean {
    // 1. 解析 scheme
    // 2. 检查是否在白名单
    // 3. 返回布尔结果（不返回原因，避免信息泄露）
}

// 白名单配置
const DEMO_ALLOWED_SCHEMES = ['demo']
```

### Path Validator 设计

```typescript
export function validatePathSafety(path: string, allowedRoot: string): { valid: boolean; reason?: string } {
    // 1. 规范化路径（path.normalize）
    // 2. 检查是否为绝对路径
    // 3. 检查是否包含 ../
    // 4. 检查是否以 allowedRoot 开头
    // 5. 检查是否是符号链接（lstat）
    // 6. 检查是否是隐藏文件
    // 注意：reason 仅用于日志，不返回给用户
}
```

### Demo Resolver 设计

```typescript
export class DemoResourceResolver {
    private readonly allowedRoot: string = 'examples/demo-corpus/'
    private readonly allowedExtensions: string[] = ['.md', '.ts', '.tsx', '.json']

    resolve(uri: string): Resource | null {
        // 1. Scheme 验证
        // 2. 提取路径
        // 3. 路径规范化
        // 4. 路径安全验证
        // 5. 扩展名验证
        // 6. 读取文件内容
        // 7. 返回标准化资源对象
        // 注意：所有失败都返回 null，不暴露原因
    }
}
```

### 错误处理设计

```typescript
// 用户可见的错误消息（统一、不泄露信息）
const DEMO_ACCESS_DENIED_MESSAGE = 'Access denied: Only @demo:// resources are allowed in demo mode'

// 日志使用的详细错误原因（脱敏，不暴露给用户）
const LOG_MESSAGES = {
    INVALID_SCHEME: 'Invalid scheme: only @demo:// is allowed',
    PATH_TRAVERSAL: 'Path traversal attempt detected',
    ABSOLUTE_PATH: 'Absolute paths are not allowed',
    SYMLINK: 'Symbolic links are not allowed',
    HIDDEN_FILE: 'Hidden files are not allowed',
    OUTSIDE_ROOT: 'Path is outside allowed root directory',
}
```

## Non-goals

### 明确不做的功能

1. ❌ 不实现动态可配置的白名单（硬编码即可）
2. ❌ 不实现 RBAC 权限系统
3. ❌ 不实现访问速率限制
4. ❌ 不实现审计日志持久化
5. ❌ 不实现告警集成
6. ❌ 不实现加密或访问令牌
7. ❌ 不修改其他非 demo 命令

### 明确不涉及的范围

1. ❌ 不修改 Tasklist Agent 的资源访问
2. ❌ 不修改普通聊天的资源访问
3. ❌ 不修改流式协议或 reducer schema
4. ❌ 不修改 Graph 拓扑结构
5. ❌ 不新增数据库表或字段

## Risks and Mitigations

| 风险               | 影响 | 概率 | 应对措施                            |
| ------------------ | ---- | ---- | ----------------------------------- |
| 验证逻辑绕过       | 严重 | 低   | 四层防御 + 渗透测试 + 代码审查      |
| 规范化后仍可绕过   | 严重 | 中   | 使用成熟的路径安全库 + fuzz testing |
| 符号链接攻击       | 高   | 低   | lstat 检查 + 拒绝所有符号链接       |
| 错误信息泄露       | 中   | 中   | 统一错误消息 + 日志脱敏             |
| 正常功能被误拦截   | 中   | 中   | 充分的集成测试 + 白名单验证         |
| Windows 路径兼容性 | 低   | 中   | 同时测试 Windows 和 POSIX 路径      |

## Testing Strategy

### 安全测试（重点）

- ✅ 路径遍历攻击测试：`@demo://../package.json`
- ✅ 绝对路径测试：`@demo://etc/passwd`
- ✅ 符号链接测试：指向外部文件的符号链接
- ✅ Scheme 注入测试：`@file://`、`@docs://`
- ✅ 隐藏文件测试：`.env`、`.git/config`
- ✅ 大小写绕过测试：`@DEMO://`、`@Demo://`
- ✅ Unicode 编码测试：百分号编码、UTF-8 变体
- ✅ Fuzz testing：随机生成恶意路径

### 单元测试

- ✅ Scheme Validator 的所有边界情况
- ✅ Path Validator 的所有边界情况
- ✅ Demo Resolver 的所有验证逻辑
- ✅ 错误消息脱敏验证

### 集成测试

- ✅ `/delivery-chain` 命令的资源访问
- ✅ Resource Picker 的数据源限制
- ✅ Picker UI 的展示内容限制

### 回归测试

- ✅ 非 demo 命令不受影响
- ✅ 正常的 demo 资源访问正常
- ✅ Tasklist Agent 功能正常
- ✅ 流式输出正常

## Acceptance Criteria Suggestions

基于方案设计，建议补充以下验收标准：

### 补充 AC6: 安全测试通过

- [ ] 所有路径遍历攻击尝试被拦截
- [ ] 所有符号链接被拒绝
- [ ] 所有隐藏文件被拒绝
- [ ] 所有非白名单 scheme 被拒绝
- [ ] Fuzz testing 未发现绕过方式

### 补充 AC7: 错误消息脱敏

- [ ] 所有拒绝返回相同的错误消息
- [ ] 错误消息不包含真实路径
- [ ] 错误消息不包含验证失败原因
- [ ] 错误消息不包含堆栈跟踪

### 补充 AC8: 无回归

- [ ] 非 demo 命令功能正常
- [ ] 正常的 demo 资源访问不受影响
- [ ] Tasklist Agent 功能正常
- [ ] Picker UI 交互正常

## Implementation Checklist

- [ ] 创建 Scheme Validator（纯函数）
- [ ] 创建 Path Validator（纯函数）
- [ ] 增强 Demo Resolver，添加四层验证
- [ ] 修改 Resource Picker，限制数据源
- [ ] 修改 Picker UI 组件
- [ ] 修改 `/delivery-chain` 命令注入 demo resolver
- [ ] 编写安全测试用例
- [ ] 编写单元测试（覆盖率 100%）
- [ ] 编写集成测试
- [ ] Fuzz testing
- [ ] 渗透测试（路径遍历、符号链接等）
- [ ] 代码审查（安全专项审查）
- [ ] 本地验证所有场景
