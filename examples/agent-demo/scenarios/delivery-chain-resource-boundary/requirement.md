# Requirement: Delivery Chain Resource Boundary

状态: Final
版本: v1.0
日期: 2026-07-01
场景ID: delivery-chain-resource-boundary

## User Story

作为 AI Mind 系统维护者，我希望 Delivery Chain 功能在读取资源时只允许访问公开的 demo corpus 目录，不得读取真实项目目录，这样可以确保公开 demo 不会意外泄露项目内部代码，同时保护用户数据安全。

## Background

### 业务背景

- AI Mind 的 `/delivery-chain` 命令是一个公开 demo 功能
- 它需要读取示例项目文件来演示 delivery 流程
- 但不能允许它访问真实的项目源码、配置文件或敏感数据
- 需要建立明确的资源边界，确保"沙箱"效果

### 技术背景

- 当前的 resource resolver 可能允许访问任意文件系统路径
- picker 组件可能展示真实的仓库内容
- 需要在 resolver 层建立白名单机制
- 需要在 picker 层限制数据源

## Detailed Description

### 功能描述

建立 Delivery Chain 的资源边界机制：

- 只允许读取 `examples/demo-corpus/` 目录下的文件
- 拒绝访问 `@docs://`、`@file://` 等其他 scheme
- 拒绝访问绝对路径和相对路径逃逸（如 `../`）
- Picker 组件只展示 demo corpus 内容
- 错误提示清晰且不泄露真实目录结构

### 资源白名单规则

```
允许的 scheme:
  ✅ @demo://  -> 映射到 examples/demo-corpus/

禁止的 scheme:
  ❌ @docs://  -> 项目文档目录
  ❌ @file://  -> 任意文件系统路径
  ❌ @git://   -> Git 历史
  ❌ 其他自定义 scheme

禁止的路径模式:
  ❌ 绝对路径（以 / 开头）
  ❌ 路径逃逸（包含 ../）
  ❌ 符号链接
  ❌ 隐藏文件（以 . 开头）
```

### 错误处理规范

- 访问被拒绝时返回 403 Forbidden
- 错误消息："Access denied: Only @demo:// resources are allowed in demo mode"
- 不透露被拒绝的具体原因（避免攻击者探测目录结构）
- 日志记录拒绝事件（脱敏处理）

## Acceptance Criteria

### AC1: Scheme 白名单验证

- [ ] 只允许 `@demo://` scheme
- [ ] 拒绝 `@docs://` scheme
- [ ] 拒绝 `@file://` scheme
- [ ] 拒绝其他未注册的 scheme
- [ ] 拒绝时返回正确的错误消息

### AC2: 路径安全验证

- [ ] 拒绝绝对路径访问
- [ ] 拒绝包含 `../` 的路径
- [ ] 拒绝符号链接访问
- [ ] 拒绝隐藏文件访问
- [ ] 路径规范化后重新验证

### AC3: Picker 数据源限制

- [ ] Picker 只展示 demo corpus 内容
- [ ] Picker 不展示真实仓库文件
- [ ] Picker 不展示 docs 目录
- [ ] Picker 不展示 node_modules
- [ ] Picker 不展示配置文件

### AC4: Resolver 边界验证

- [ ] Resolver 只返回 demo corpus 内的文件
- [ ] Resolver 不会泄露真实文件系统结构
- [ ] 路径映射正确（@demo:// -> examples/demo-corpus/）
- [ ] 读取失败时不暴露真实路径
- [ ] 所有错误消息已脱敏

### AC5: 命令入口验证

- [ ] `/delivery-chain` 命令只使用 demo resolver
- [ ] `/tasklist` 示例入口也使用 demo 边界
- [ ] 其他命令不受影响
- [ ] 不修改 Graph 拓扑结构
- [ ] 不修改 reducer schema
