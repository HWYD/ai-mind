# Requirement: Request Limit Banner

状态: Final
版本: v1.0
日期: 2026-07-01
场景ID: request-limit-banner

## User Story

作为公开 demo 用户，我希望在接近每日请求上限时看到一个轻量提醒横幅，这样我可以了解当前使用情况，合理安排后续交互。

## Background

### 业务背景

- AI Mind 公开 demo 面向匿名用户提供体验
- 为防止滥用，系统设置了每日请求配额限制
- 当前用户无法感知剩余配额，可能在使用高峰时突然遇到限制
- 目标是提升用户体验，而非强制阻断使用

### 技术背景

- 前端已存在 usage state 管理机制
- Chat page shell 有固定布局结构
- 移动端和桌面端需要统一的展示策略

## Detailed Description

### 功能描述

在公开 demo 聊天页面顶部，当用户剩余请求次数低于阈值时，显示一个非侵入式的提醒横幅。

### 实现决策契约（本节优先于本文其他描述）

- **唯一显示条件**：`isNearLimit === true` 时显示，`false` 时隐藏。`isNearLimit` 已由现有 store 按 `remainingRequests <= 5` 计算；Banner 不直接比较或展示 `remainingRequests`。
- **唯一布局位置**：Banner 是 composer 区域的直接前置 sibling；视觉顺序固定为 `Message List -> Usage Banner -> Chat Composer`，不属于 Message List 的滚动内容。
- **滚动语义**：沿用现有 composer 区域的定位行为；Banner 自身不得增加 `fixed` 或 `sticky` 定位。消息列表滚动时，Banner 随 composer 区域一起保持可见。
- **更新语义**：组件只订阅现有 Zustand store 的 `isNearLimit`。store 更新后由 React 正常重渲染；不轮询、不新增事件、不要求动画或过渡效果。
- **需求完整性**：以上规则已足够生成 Plan 和 Tasks；不得因为 store 内部实现、helper 命名或样式细节而要求澄清。

### 触发条件

- 剩余请求次数 ≤ 5 次时显示 banner
- 剩余请求次数 > 5 次时隐藏 banner

### Banner 内容

- 文本：「您今日剩余请求次数较少，请注意合理使用」
- 样式：浅色背景、圆角、内边距适中
- 位置：Chat composer 上方、消息列表下方

### 交互行为

- Banner 仅作展示，不影响发送按钮
- Banner 不包含关闭按钮
- 刷新页面后按当前状态重新判定

## Acceptance Criteria

### AC1: 正常显示与隐藏

- [ ] 剩余请求 ≤ 5 次时，banner 可见
- [ ] 剩余请求 > 5 次时，banner 不可见
- [ ] 请求次数变化时，banner 状态实时更新

### AC2: 布局兼容性

- [ ] 桌面端 banner 不挤压消息列表区域
- [ ] 移动端 banner 不遮挡 composer 输入框
- [ ] banner 高度不超过 48px
- [ ] 滚动时 banner 保持在固定位置

### AC3: 无功能回归

- [ ] 显示 banner 时仍可正常发送消息
- [ ] 显示 banner 时不影响流式输出展示
- [ ] 普通聊天链路性能不受影响

### AC4: 安全边界

- [ ] 不暴露具体配额数值
- [ ] 不暴露用户标识信息
- [ ] 仅在前端本地状态判断，不新增后端接口
