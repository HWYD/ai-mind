# Context: Request Limit Banner

状态: Final
版本: v1.0
日期: 2026-07-01
场景ID: request-limit-banner

## Product Context

### 产品定位

- 这是 AI Mind 公开 demo 入口，面向匿名用户
- 不需要登录，不需要账户体系
- 目标是提供轻量、流畅的 AI 交互体验
- 配额限制是防滥用机制，不是付费墙

### 设计原则

- 提醒优先于阻断
- 非侵入式展示
- 保持页面简洁
- 不增加用户认知负担

### 用户体验目标

- 让用户感知到配额状态
- 不因提醒打断正常聊天流程
- 移动端和桌面端体验一致

## Technical Context

### 技术栈

- Next.js App Router
- React 18 + TypeScript
- Tailwind CSS
- Zustand for state management

### 现有架构

```text
Chat Page Shell
  ├── Message List
  ├── [NEW] Usage Banner (本任务新增)
  └── Chat Composer
        └── Usage State
```

### State 管理

- `useUsageStore()` 提供只读的配额状态
- State 来源：HTTP response header 或本地 cookie
- 不提供写入 API

## Module Map

| 模块名称                                       | 职责             | 改动范围             |
| ---------------------------------------------- | ---------------- | -------------------- |
| `apps/webapp/components/chat/chat-shell.tsx`   | 聊天页面布局容器 | 新增 banner 插槽     |
| `apps/webapp/components/chat/usage-banner.tsx` | 配额提醒横幅     | ✅ 新增文件          |
| `apps/webapp/lib/stores/usage-store.ts`        | 配额状态管理     | 仅读取，不修改       |
| `apps/webapp/styles/chat.css`                  | 聊天页面样式     | 增量添加 banner 样式 |

## Interface Contracts

### 输入契约

- 只读访问 `useUsageStore().remainingRequests`
- 只读访问 `useUsageStore().isNearLimit`
- 不新增后端 API
- 不修改 HTTP 响应头格式

### 输出契约

- 不修改 stream protocol
- 不修改 WebSocket schema
- 不修改 chat message 结构
- 不修改 reducer action types

### 兼容性保证

- 向后兼容：无 banner 时布局不变
- 向前兼容：后续配额调整不影响组件接口

## Constraints

### 技术约束

- 仅使用 Tailwind utility classes，不新增 CSS-in-JS
- Banner 高度 ≤ 48px
- 不引入新的 npm 依赖
- 移动端和桌面端共用同一数据源

### 设计约束

- 不使用 Modal、Toast 等打断式组件
- 不添加关闭按钮
- 不使用动画效果
- 颜色使用现有 design token

### 安全约束

- 不暴露具体配额数值
- 不暴露用户标识
- 不写入 localStorage（只读已有 cookie）

## Resource Boundary

### 允许访问的资源

- ✅ `apps/webapp/components/chat/` 目录下的组件
- ✅ `apps/webapp/lib/stores/usage-store.ts`（只读）
- ✅ 现有 Tailwind design tokens

### 禁止访问的资源

- ❌ 真实后端 API 代码
- ❌ 数据库 schema
- ❌ 认证相关代码
- ❌ `packages/stream-core/` 协议定义
- ❌ 其他页面组件

## Non-functional Requirements

### 性能

- Banner 渲染不阻塞消息列表
- 状态更新不引起全屏重渲染
- Bundle size 增量 < 1KB

### 可访问性

- Banner 文本对比度 ≥ 4.5:1
- 屏幕阅读器可以正确读取提醒内容
- 不依赖颜色单独传达信息

### 可测试性

- 支持通过 mock store 测试显示/隐藏逻辑
- 支持不同视口尺寸的 E2E 测试
