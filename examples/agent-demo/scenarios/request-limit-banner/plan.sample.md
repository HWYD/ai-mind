# Sample Plan: Request Limit Banner

状态: Sample
版本: v1.0
日期: 2026-07-01
场景ID: request-limit-banner
方案类型: 前端 UI 增强

## Requirement Understanding

### 需求理解

本任务的核心是在公开 demo 聊天页面增加一个非侵入式的配额提醒横幅。当用户接近每日请求上限时，给予温和提醒，提升用户体验。

### 关键要点

- **展示时机**：剩余请求 ≤ 5 次时显示
- **展示位置**：Chat composer 上方、消息列表下方
- **交互原则**：仅展示，不阻断，不关闭
- **安全边界**：不暴露具体数值，不新增后端接口

### 用户价值

- 避免用户在使用高峰时突然遇到限制
- 提升用户对系统状态的感知
- 保持 demo 体验的流畅性

## Implementation Approach

### 整体方案

采用纯前端实现方案，复用现有 usage state 管理机制，在 chat shell 中新增 banner 组件。

### 方案选型理由

| 方案          | 优点                 | 缺点               | 选择    |
| ------------- | -------------------- | ------------------ | ------- |
| 纯前端 banner | 无后端依赖、改动最小 | 状态来自前端       | ✅ 选择 |
| 后端推送通知  | 实时性强             | 复杂度高、需改协议 | ❌ 不选 |
| Toast 弹窗    | 醒目                 | 打断用户、侵入性强 | ❌ 不选 |

### 核心设计

1. **组件分层**：独立 `UsageBanner` 组件，单一职责
2. **状态订阅**：仅订阅 `isNearLimit`，避免不必要重渲染
3. **条件渲染**：使用 CSS visibility 而非 mount/unmount，减少重排

## Module Changes

### 新增模块

| 文件路径                                       | 职责             |
| ---------------------------------------------- | ---------------- |
| `apps/webapp/components/chat/usage-banner.tsx` | 配额提醒横幅组件 |

### 修改模块

| 文件路径                                     | 改动内容                   |
| -------------------------------------------- | -------------------------- |
| `apps/webapp/components/chat/chat-shell.tsx` | 新增 banner 插槽，引入组件 |
| `apps/webapp/styles/chat.css`                | 添加 banner 样式           |

### 不涉及模块

- ❌ 后端 API 代码
- ❌ 数据库 schema
- ❌ 流式协议定义
- ❌ Reducer / State management 逻辑
- ❌ 其他页面组件

## Technical Design

### 组件接口设计

```tsx
interface UsageBannerProps {
    // 无外部 props，内部从 store 读取状态
}

// 内部状态
const isNearLimit = useUsageStore(state => state.isNearLimit)
```

### 样式设计

```css
/* 使用 Tailwind classes */
.usage-banner {
    @apply bg-amber-50 text-amber-800 px-4 py-2 text-sm text-center;
    @apply border-b border-amber-100;
}
```

### 布局集成

```tsx
// chat-shell.tsx
<div className="flex flex-col h-full">
    <MessageList />
    <UsageBanner /> {/* 新增位置 */}
    <ChatComposer />
</div>
```

## Non-goals

### 明确不做的功能

1. ❌ 不实现配额耗尽后的阻断功能
2. ❌ 不实现 banner 关闭按钮
3. ❌ 不实现倒计时或精确数字显示
4. ❌ 不新增后端 API 或修改协议
5. ❌ 不实现多语言支持
6. ❌ 不实现动画或过渡效果
7. ❌ 不实现用户偏好记忆

### 明确不涉及的范围

1. ❌ 不修改 usage state 写入逻辑
2. ❌ 不修改认证或鉴权机制
3. ❌ 不修改流式输出协议
4. ❌ 不修改消息存储结构

## Risks and Mitigations

| 风险             | 影响 | 概率 | 应对措施                           |
| ---------------- | ---- | ---- | ---------------------------------- |
| 移动端布局挤压   | 高   | 中   | 使用 E2E 测试覆盖 360px 视口       |
| Banner 高度超标  | 中   | 低   | 代码审查时检查 max-height          |
| 状态更新导致闪烁 | 中   | 低   | 使用 CSS visibility 而非条件 mount |
| 暗色模式兼容性   | 中   | 低   | 使用 Tailwind 暗色模式前缀         |

## Testing Strategy

### 单元测试

- ✅ 剩余 ≤ 5 次时 banner 可见
- ✅ 剩余 > 5 次时 banner 不可见
- ✅ 状态变化时正确切换
- ✅ 不影响子组件渲染

### 集成测试

- ✅ Chat shell 正常渲染 banner
- ✅ 发送消息功能正常
- ✅ 流式输出不受影响

### E2E 测试

- ✅ 桌面端布局正常
- ✅ 移动端（360px）布局正常
- ✅ 滚动时 banner 位置正确

### 手动验证

- 📋 不同浏览器兼容性检查
- 📋 暗色模式下样式检查

## Acceptance Criteria Suggestions

基于方案设计，建议补充以下验收标准：

### 补充 AC5: 样式规范

- [ ] Banner 使用指定的 amber 色系
- [ ] 文本居中对齐
- [ ] 字体大小为 14px
- [ ] 内边距上下 8px、左右 16px

### 补充 AC6: 性能指标

- [ ] Banner 渲染耗时 < 5ms
- [ ] 状态切换不引起全屏重渲染
- [ ] Lighthouse 性能评分不下降

## Implementation Checklist

- [ ] 创建 `usage-banner.tsx` 组件
- [ ] 在 `chat-shell.tsx` 中集成 banner
- [ ] 添加样式类到 `chat.css`
- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 本地验证桌面端
- [ ] 本地验证移动端
- [ ] 验证不影响聊天功能
- [ ] 代码审查
