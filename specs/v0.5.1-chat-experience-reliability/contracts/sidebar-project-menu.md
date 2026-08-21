# Contract: Sidebar Project Menu

## Scope

桌面 `ConversationSidebar` 在 `SidebarContent` 之外、移动 `ConversationMobileSelector` 在 `SheetContent` 的会话 `ScrollArea` 之外提供固定底部菜单。该契约是纯客户端 UI 行为，不新增 API、Stream DTO、cookie 字段、IndexedDB record、Electron IPC 或外链许可。

## Visible Contract

- 展开态显示圆形中性用户图标与“访客用户”；折叠态只显示图标，并保留“打开访客菜单”的无障碍名称。
- 菜单向上展开，顶部展示“访客用户”，当前唯一操作项为带 GitHub 标识的“GitHub 项目”；`https://github.com/HWYD/ai-mind` 仅通过该项的原生 hover title 展示。
- 两端入口均位于会话 `ScrollArea` 外，不受会话操作禁用状态影响；移动端以完整头像和“访客用户”显示，不提供侧栏折叠态。

## Runtime Contract

```ts
const projectUrl = 'https://github.com/HWYD/ai-mind'
```

- 非 Electron 浏览器点击时仅调用 `window.open(projectUrl, '_blank', 'noopener,noreferrer')`，不写剪贴板。
- Electron user agent 点击时仅调用已有浏览器剪贴板能力，不调用 `window.open`。成功通知“已复制链接，请在浏览器打开”，失败通知“复制链接失败，请手动复制”；页面在约 2.5 秒后关闭提示。
- 移动抽屉中的 Electron 复制成功或失败后关闭抽屉，使聊天区顶部提示立即可见。
- 临时提示与复制状态不持久化；刷新、会话切换或站点数据清理不会恢复它。
