# Context: Delivery Chain Resource Boundary

状态: Final
版本: v1.0
日期: 2026-07-01
场景ID: delivery-chain-resource-boundary

## Product Context

### 产品定位

- Delivery Chain 是公开 demo 功能，用于演示 AI 驱动的交付流程
- 它应该使用示例项目数据，而不是真实项目
- 安全性和数据隔离的优先级高于功能丰富性
- 所有 demo 功能必须在"沙箱"环境中运行

### 设计原则

- 默认拒绝，明确允许（白名单机制）
- 深度防御：多层验证（picker 层 + resolver 层）
- 最小权限：只授予必要的访问权限
- 安全失败：拒绝时不泄露信息

### 用户体验目标

- 用户感知不到边界限制（一切看起来正常工作）
- 被拒绝时获得清晰、友好的提示
- Picker 体验流畅，只展示可用内容

## Technical Context

### 技术栈

- Node.js 文件系统 API
- Path 规范化与安全验证
- React Picker 组件
- TypeScript 类型系统

### 现有架构

```
Command Entry (@delivery-chain)
  ├── Context Loader
  │   ├── Resource Picker (UI 层)
  │   └── Resource Resolver (逻辑层)
  └── Delivery Manager
```

### 安全威胁

- 路径遍历攻击（Path Traversal）
- 敏感文件泄露
- 符号链接攻击
- Scheme 注入攻击
- 错误信息泄露

## Module Map

| 模块名称                                            | 职责                | 改动范围                    |
| --------------------------------------------------- | ------------------- | --------------------------- |
| `apps/webapp/lib/ai/resources/demo-resolver.ts`     | Demo 资源解析器     | ✅ 新增：安全验证逻辑       |
| `apps/webapp/lib/ai/resources/resource-picker.ts`   | 资源选择器          | ✅ 修改：限制数据源         |
| `apps/webapp/lib/ai/resources/scheme-validator.ts`  | Scheme 验证器       | ✅ 新增：白名单验证         |
| `apps/webapp/lib/ai/resources/path-validator.ts`    | 路径安全验证        | ✅ 新增：规范化与逃逸检测   |
| `apps/webapp/components/picker/resource-picker.tsx` | Picker UI 组件      | ✅ 修改：数据源限制         |
| `apps/webapp/lib/ai/commands/delivery-chain.ts`     | Delivery Chain 命令 | ✅ 修改：使用 demo resolver |

## Interface Contracts

### 输入契约

- Resource URI 格式：`@<scheme>://<path>`
- Picker 数据源接口保持不变
- Resolver 接口保持不变
- 不新增命令行参数

### 输出契约

- 拒绝时返回标准化错误对象
- 不泄露真实文件系统路径
- 不泄露被拒绝的具体原因
- 日志输出脱敏处理

### 兼容性保证

- 正常的 demo 资源访问行为不变
- 其他命令（非 demo）不受影响
- Picker UI 交互不变
- 可随时回滚而不影响功能

## Constraints

### 技术约束

- 不使用 `fs.realpath`（可能跟随符号链接）
- 必须进行路径规范化（`path.normalize`）
- 必须在规范化后重新验证
- 所有验证逻辑必须是纯函数、可测试的

### 设计约束

- 多层验证：Picker 层 + Resolver 层
- 白名单优先：只允许明确列出的内容
- Fail-closed：验证失败时默认拒绝
- 所有验证逻辑必须有单元测试覆盖

### 安全约束

- 不暴露真实文件系统结构
- 不暴露配置文件内容
- 不暴露环境变量
- 不暴露 Git 历史或元数据
- 错误消息不包含调试信息

## Resource Boundary

### 允许访问的资源

- ✅ `examples/demo-corpus/` 目录及其子目录
- ✅ 只允许 `.md`、`.ts`、`.tsx`、`.json` 扩展名
- ✅ 非隐藏文件
- ✅ 非符号链接

### 禁止访问的资源

- ❌ 项目根目录的任何文件
- ❌ `docs/` 目录
- ❌ `packages/` 目录
- ❌ `apps/` 目录
- ❌ `node_modules/` 目录
- ❌ `.env*` 等配置文件
- ❌ `.git/` 目录
- ❌ 所有隐藏文件
- ❌ 所有符号链接

## Non-functional Requirements

### 安全性

- 必须通过路径遍历攻击测试
- 必须通过符号链接攻击测试
- 必须通过 Scheme 注入测试
- 错误消息不得包含敏感信息

### 性能

- 路径验证开销 < 1ms
- Resolver 缓存命中 < 0.1ms
- Picker 加载时间 < 100ms

### 可测试性

- 所有验证函数都是纯函数
- 支持注入 mock 文件系统
- 支持测试所有边界情况
- 支持 fuzz testing

### 可观测性

- 所有拒绝事件必须记录日志
- 日志包含请求来源（脱敏）
- 日志不包含敏感数据
- 支持安全审计

## Security Model

### 验证流程

```
1. Scheme 验证
   ├── 必须是 @demo://
   └── 拒绝其他所有 scheme

2. 路径规范化
   ├── 解析相对路径
   ├── 处理 . 和 ..
   └── 标准化路径分隔符

3. 路径安全验证
   ├── 必须以 demo-corpus 根开头
   ├── 不能包含 ../
   ├── 不能是绝对路径
   ├── 不能是符号链接
   └── 不能是隐藏文件

4. 扩展名白名单验证
   └── 只能是 .md, .ts, .tsx, .json

5. 文件存在性验证
   └── 只返回存在且允许的文件
```

### 深度防御原则

1. **Picker 层**：只展示允许的文件（第一层）
2. **Resolver 层**：再次验证所有请求（第二层）
3. **Scheme Validator**：验证 scheme 白名单（第三层）
4. **Path Validator**：验证路径安全性（第四层）
