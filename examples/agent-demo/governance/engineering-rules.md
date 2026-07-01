# Engineering Rules (工程规则)

版本: v1.0  
日期: 2026-07-01  
适用范围: Delivery Chain 所有工程活动

## 总览

本文档定义了 Delivery Chain 的工程规则，用于确保代码质量、可维护性、可测试性和安全性。所有工程活动必须严格遵守这些规则。

---

## 1. 代码质量规则

### 1.1 TypeScript 类型规则

✅ **必须遵守**：

1. **严格模式**
    - 必须启用 TypeScript strict 模式
    - 必须启用 strictNullChecks
    - 必须启用 noImplicitAny
    - 必须启用 strictFunctionTypes

2. **类型安全**
    - 禁止使用 `any` 类型（除非绝对必要且有充分理由）
    - 禁止使用类型断言 `as`（除非是类型守卫）
    - 禁止使用 `@ts-ignore` 或 `@ts-nocheck`
    - 必须为所有函数、变量、参数添加正确的类型注解

3. **类型定义**
    - 必须优先使用接口（interface）定义对象类型
    - 必须使用联合类型（union）而非 any
    - 必须使用泛型（generic）提高类型复用性
    - 必须为工具函数添加类型守卫

❌ **严格禁止**：

```typescript
// ❌ 禁止使用 any
function process(data: any): any

// ❌ 禁止使用类型断言绕过类型检查
const result = obj as unknown as MyType

// ❌ 禁止使用 @ts-ignore
// @ts-ignore
const value = obj.value
```

### 1.2 代码风格规则

✅ **必须遵守**：

1. **命名规范**
    - 变量和函数使用 camelCase
    - 类和接口使用 PascalCase
    - 常量使用 UPPER_SNAKE_CASE
    - 私有成员使用 \_camelCase（下划线前缀）
    - 文件名使用 kebab-case
    - 命名必须有意义，禁止使用单字母变量（循环变量 i 除外）

2. **代码格式**
    - 必须使用 Prettier 自动格式化
    - 缩进使用 2 个空格
    - 行宽不超过 100 字符
    - 必须使用分号结尾
    - 字符串使用单引号

3. **代码结构**
    - 函数长度不超过 50 行
    - 文件长度不超过 500 行
    - 单个文件最多 5 个顶级函数
    - 单个类最多 20 个公共方法

### 1.3 代码注释规则

✅ **必须遵守**：

1. **注释原则**
    - 注释"为什么"，而不是"是什么"
    - 代码应该自文档化，注释只解释不明显的部分
    - 复杂的算法必须有详细的步骤说明
    - 边界情况必须有注释说明

2. **JSDoc 规范**
    - 所有公共 API 必须有 JSDoc 注释
    - 必须包含 @param、@returns 说明
    - 必须包含 @throws 说明可能的异常
    - 必须包含 @example 示例

```typescript
/**
 * 验证路径是否在允许的根目录内
 *
 * @param path - 要验证的路径（必须已规范化）
 * @param allowedRoot - 允许的根目录
 * @returns 如果路径在根目录内返回 true，否则返回 false
 * @throws 如果路径未规范化抛出 Error
 *
 * @example
 * validatePathWithinRoot('/demo/files/file.txt', '/demo/') // true
 * validatePathWithinRoot('/demo/../etc/passwd', '/demo/') // false
 */
export function validatePathWithinRoot(path: string, allowedRoot: string): boolean
```

---

## 2. 安全编码规则

### 2.1 输入验证规则

✅ **必须遵守**：

1. **验证一切**
    - 所有外部输入必须验证
    - 所有函数参数必须验证
    - 所有配置值必须验证
    - 所有环境变量必须验证

2. **白名单优先**
    - 优先使用白名单验证
    - 其次使用黑名单验证
    - 默认拒绝，而不是默认允许

3. **路径安全**
    - 所有路径必须先规范化（path.normalize）
    - 规范化后必须验证是否在允许目录内
    - 必须防止路径遍历攻击（../）
    - 必须检查符号链接

```typescript
import path from 'path'
import fs from 'fs'

export function isPathWithinRoot(inputPath: string, allowedRoot: string): boolean {
    // 1. 先规范化路径
    const normalizedPath = path.normalize(inputPath)

    // 2. 解析绝对路径
    const absolutePath = path.resolve(allowedRoot, normalizedPath)

    // 3. 确保以允许的根目录开头
    const resolvedRoot = path.resolve(allowedRoot)
    const withinRoot = absolutePath.startsWith(resolvedRoot + path.sep) || absolutePath === resolvedRoot

    // 4. 检查符号链接
    if (fs.lstatSync(absolutePath).isSymbolicLink()) {
        return false
    }

    return withinRoot
}
```

### 2.2 错误处理规则

✅ **必须遵守**：

1. **错误信息脱敏**
    - 错误信息不得包含敏感数据
    - 错误信息不得包含堆栈跟踪
    - 错误信息不得包含内部路径
    - 错误信息不得包含用户数据

2. **错误分类**
    - 安全错误：必须记录，但不暴露给用户
    - 业务错误：可以适当暴露给用户
    - 系统错误：必须记录，用户只看到通用错误

3. **失败关闭**
    - 验证失败时必须拒绝，而不是接受
    - 失败时必须回滚任何部分完成的操作
    - 失败时必须清理临时资源

### 2.3 日志安全规则

✅ **必须遵守**：

1. **日志内容限制**
    - 不得记录密码、密钥、令牌等敏感信息
    - 不得记录完整的请求/响应体
    - 不得记录个人身份信息（PII）
    - 不得记录信用卡号、银行账号等财务信息

2. **日志级别控制**
    - DEBUG 级别只能在开发环境启用
    - INFO 级别记录关键业务事件
    - WARN 级别记录异常但可恢复的情况
    - ERROR 级别记录严重错误

3. **日志格式规范**
    - 必须包含时间戳
    - 必须包含日志级别
    - 必须包含模块/组件名称
    - 必须包含请求 ID（如果有）

---

## 3. 测试规则

### 3.1 单元测试规则

✅ **必须遵守**：

1. **覆盖率要求**
    - 核心业务逻辑：100% 覆盖率
    - 安全相关代码：100% 覆盖率
    - 工具函数：90%+ 覆盖率
    - 整体：80%+ 覆盖率

2. **测试原则**
    - 每个测试只测试一件事
    - 测试必须是确定性的（不依赖外部环境）
    - 测试必须独立运行（不依赖其他测试）
    - 测试必须快速（每个测试 < 10ms）

3. **测试命名**
    - 测试文件：`*.test.ts`
    - 测试名称必须清晰描述测试场景
    - 建议使用：`should [expected behavior] when [scenario]`

```typescript
describe('validatePathWithinRoot', () => {
    it('should return true when path is within root', () => {})
    it('should return false when path contains ../ traversal', () => {})
    it('should return false when path is a symbolic link', () => {})
    it('should throw error when path is not normalized', () => {})
})
```

### 3.2 边界测试规则

✅ **必须遵守**：

1. **必须测试的边界情况**
    - 空值、空字符串、空数组
    - 最小值、最大值
    - 边界值（刚好在边界上）
    - 刚好超出边界的值
    - 特殊字符（控制字符、Unicode 等）
    - 非常大的输入
    - 非常小的输入

2. **必须测试的异常情况**
    - 所有 throw 语句都必须有测试
    - 所有错误路径都必须有测试
    - 所有边缘情况都必须有测试

### 3.3 安全测试规则

✅ **必须遵守**：

1. **路径遍历攻击测试**
    - 必须测试 `../` 各种变体
    - 必须测试 Windows 路径 `..\`
    - 必须测试 URL 编码 `%2e%2e%2f`
    - 必须测试双编码 `%252e%252e%252f`
    - 必须测试 Unicode 变体

2. **输入验证测试**
    - 必须测试空输入
    - 必须测试超长输入
    - 必须测试特殊字符
    - 必须测试无效格式

3. **Fuzz Testing**
    - 安全关键函数必须进行 fuzz testing
    - 至少运行 10,000 次随机输入
    - 必须包含各种恶意 payload

---

## 4. 代码审查规则

### 4.1 审查前检查清单

在提交代码审查前，必须确认：

- [ ] 代码可以正常编译，没有 TypeScript 错误
- [ ] 所有单元测试通过
- [ ] 测试覆盖率达到要求
- [ ] 代码已经通过 Prettier 和 ESLint 检查
- [ ] 没有遗留的 console.log 或调试代码
- [ ] 没有硬编码的密码、密钥、令牌
- [ ] 所有新添加的公共 API 都有 JSDoc 注释
- [ ] 所有变更都有对应的测试
- [ ] 变更文档已经更新

### 4.2 审查者检查清单

审查者必须检查：

- [ ] 代码逻辑正确，符合需求
- [ ] 没有安全漏洞
- [ ] 错误处理完善
- [ ] 测试覆盖充分
- [ ] 代码风格一致
- [ ] 命名合理，易于理解
- [ ] 注释充分，解释"为什么"
- [ ] 没有范围蔓延
- [ ] 性能可以接受
- [ ] 没有引入新的依赖

### 4.3 安全专项审查

对于安全相关的代码，必须额外检查：

- [ ] 所有输入都已验证
- [ ] 所有路径都已规范化
- [ ] 所有错误信息都已脱敏
- [ ] 所有日志都不含敏感信息
- [ ] 没有使用 eval() 或类似功能
- [ ] 没有使用不安全的正则表达式
- [ ] 没有 SQL 注入风险
- [ ] 没有 XSS 风险
- [ ] 没有命令注入风险

---

## 5. 性能规则

### 5.1 性能预算

✅ **必须遵守**：

| 指标         | 阈值    | 说明         |
| ------------ | ------- | ------------ |
| 函数执行时间 | < 10ms  | 同步函数     |
| API 响应时间 | < 500ms | P95 延迟     |
| 内存增长     | < 10MB  | 单次请求     |
| 包大小增量   | < 10KB  | 每个变更     |
| 测试执行时间 | < 1分钟 | 完整测试套件 |

### 5.2 性能最佳实践

✅ **必须遵守**：

1. **避免过早优化**
    - 先保证正确性，再考虑性能
    - 使用性能分析工具找到瓶颈
    - 优化必须有数据支持

2. **内存管理**
    - 避免不必要的对象创建
    - 及时清理事件监听器
    - 避免内存泄漏
    - 使用 WeakMap/WeakSet 缓存

3. **算法复杂度**
    - 避免 O(n²) 或更高复杂度
    - 大数据集必须考虑性能
    - 使用合适的数据结构

---

## 6. 可维护性规则

### 6.1 代码复杂度规则

✅ **必须遵守**：

| 指标         | 阈值 | 说明             |
| ------------ | ---- | ---------------- |
| 圈复杂度     | < 10 | 每个函数         |
| 认知复杂度   | < 15 | 每个函数         |
| 函数参数数量 | < 5  | 超过使用选项对象 |
| 嵌套深度     | < 4  | 避免深层嵌套     |

### 6.2 重构规则

✅ **必须遵守**：

1. **重构原则**
    - 重构不能改变行为
    - 重构必须有测试覆盖
    - 重构应该小步进行
    - 重构应该单独提交，不与功能变更混合

2. **代码坏味道**
    - 重复代码：必须提取公共函数
    - 长函数：必须拆分
    - 深层嵌套：必须扁平化
    - 魔术数字：必须定义为常量
    - 死代码：必须删除

---

## 7. 文档规则

### 7.1 代码文档

✅ **必须遵守**：

1. **README.md**
    - 项目概述
    - 快速开始指南
    - 功能列表
    - 配置说明
    - 常见问题

2. **API 文档**
    - 所有公共 API 必须有文档
    - 每个端点的请求/响应格式
    - 每个端点的错误码说明
    - 每个端点的示例

3. **架构文档**
    - 系统架构图
    - 模块依赖关系
    - 数据流说明
    - 部署架构

### 7.2 变更日志

✅ **必须遵守**：

- 每个版本必须有 CHANGELOG.md
- 按语义化版本号组织
- 清晰标记新增、修改、删除、修复
- 每个变更都应该有说明

---

## 8. 版本控制规则

### 8.1 Git 提交规范

✅ **必须遵守**：

使用 Conventional Commits 规范：

```
<type>(<scope>): <description>

<body>

<footer>
```

**Type 类型**：

- feat: 新功能
- fix: Bug 修复
- docs: 文档更新
- style: 代码风格（不影响代码运行）
- refactor: 重构（既不是新增功能，也不是 Bug 修复）
- test: 测试相关
- chore: 构建过程或辅助工具的变动
- security: 安全相关修复

**示例**：

```
feat(path-validator): add support for Windows path validation

Add proper handling for Windows-style paths including:
- Backslash path separators
- Drive letter prefixes (C:\, D:\)
- UNC paths

Closes #123
```

### 8.2 分支策略

✅ **必须遵守**：

1. **分支命名**
    - main: 主分支，生产环境代码
    - develop: 开发分支
    - feature/\*: 功能分支
    - bugfix/\*: Bug 修复分支
    - hotfix/\*: 紧急修复分支
    - security/\*: 安全修复分支

2. **合并策略**
    - 必须通过 Pull Request 合并
    - 必须至少 1 人审查通过
    - 安全相关变更必须安全工程师审查
    - 必须所有测试通过才能合并

---

## 附录 A: 工具配置

### TypeScript 配置 (tsconfig.json)

```json
{
    "compilerOptions": {
        "strict": true,
        "strictNullChecks": true,
        "noImplicitAny": true,
        "strictFunctionTypes": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "forceConsistentCasingInFileNames": true
    }
}
```

### ESLint 配置 (.eslintrc.json)

```json
{
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking"
    ],
    "rules": {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-unsafe-assignment": "error",
        "@typescript-eslint/no-unsafe-call": "error"
    }
}
```

---

## 附录 B: 违规处理

### 违规等级

| 等级     | 描述         | 示例                  | 处理方式           |
| -------- | ------------ | --------------------- | ------------------ |
| Critical | 严重安全违规 | 使用 eval、硬编码密码 | 立即修复，代码重审 |
| High     | 严重质量违规 | any 类型、未验证输入  | 必须修复，代码重审 |
| Medium   | 中等质量违规 | 缺少注释、长函数      | 建议修复，下次迭代 |
| Low      | 轻微质量违规 | 命名不够清晰          | 可以接受，记录改进 |

### 违规统计

- 每个月统计违规情况
- Critical 和 High 违规必须跟踪直到解决
- 频繁违规的代码需要重点审查
- 重复违规必须进行培训

---

## 附录 C: 变更历史

| 版本 | 日期       | 变更内容                   | 变更人 |
| ---- | ---------- | -------------------------- | ------ |
| v1.0 | 2026-07-01 | 初始版本，定义基本工程规则 |        |
