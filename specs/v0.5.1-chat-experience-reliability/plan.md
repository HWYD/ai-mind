# Implementation Plan: AI Mind Chat Experience & Image Reliability

**Version**: `v0.5.1` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

## Summary

本版本只修改既有 webapp 的表现、浏览器侧受限缓存和图像 Agent 内部可靠性策略。没有新的数据库表、Stream chunk、API path、Provider URL 暴露或 Electron bridge；Desktop 仅通过既有同源网页获得这些能力。

## Architecture

```text
conversation registry checkpoint (max 50)
  -> /api/chat/conversations { limit: 50 }
  -> local IndexedDB index (max 50)
  -> desktop sidebar / mobile drawer scroll list

image-result-ready metadata
  -> strict same-origin image route -> Blob -> bounded IndexedDB cache
  -> result card: cache -> temporary route -> expired placeholder

workflow generation / result loading
  -> one result card with aspect-ratio shimmer placeholder

planning retry + block confirmation -> Provider 429/5xx retry -> one logical result

sidebar / mobile drawer footer GitHub action
  -> browser: new tab
  -> Electron: clipboard -> transient top status notice
```

## Implementation Changes

- 会话导航：服务端 schema、registry prune、客户端 payload guard 和本地索引均使用 50 条；不改变按 `lastActiveAt` 排序、草稿过滤、选择、删除和本地缓存清理语义。
- 标题展示：桌面 `ConversationTitleMarquee` 以 `ResizeObserver` 测量溢出，使用一次性 Web Animation；移动端维持既有截断，避免触屏场景无效动画。
- 图片恢复：图片 Blob 独立存入 IndexedDB，消息快照只保存公开 ImageBrief/ImageResult 元数据；LRU 与浏览器 quota 失败不阻塞当前临时预览。
- 图片反馈：生成和临时读取复用结果卡片内的局部 CSS 流光占位，保留视觉图标和读屏状态，不显示加载文案。
- 可靠性：单个结构化规划节点对瞬时错误最多执行 3 次底层模型请求，整次 run 仍最多 5 个逻辑规划节点；`block` 经 graph confirmation。Provider 错误携带 status/`Retry-After`，coordinator 以取消感知退避重试可确认的 429/5xx。
- 侧栏项目入口：桌面 `SidebarFooter` 位于 `SidebarContent` 之外，移动菜单位于 `SheetContent` 的会话 `ScrollArea` 之外；两端复用中性用户图标和同一个 DropdownMenu。唯一操作项显示“GitHub 项目”，完整地址以原生 hover title 保留。浏览器直接新开 GitHub 标签，Electron 仅复用浏览器剪贴板回退并通过聊天区顶部 Alert 反馈结果；移动抽屉在复制完成后关闭。

## Compatibility and Risks

- 提升容量不需 IndexedDB migration：原有 10 条索引满足新 schema；此前已被服务端旧上限裁掉的历史不会恢复。
- Provider 没有可确认幂等契约。对 5xx 的重试可能生成重复图片或额外计费；为了避免更高风险，网络投递状态未知时不重试。
- “3 次规划请求”是单个规划节点的底层模型请求上限，不是整次图像规划的总调用上限；后者继续受 5 个逻辑节点限制。
- 缓存仅属于当前浏览器/Electron profile；清除站点数据、会话删除、LRU 淘汰或 quota 写入失败后不保证恢复。
- session id 是 `HttpOnly` cookie，客户端不读取或展示；当前身份固定为“访客用户”。Electron 不放宽外链安全策略，因此项目地址只能复制后由用户在浏览器打开。

## Verification

- 运行会话 registry、conversation session、local persistence、image result、assistant message、图像 graph/coordinator/provider 的定向 Vitest。
- 运行 `pnpm --dir apps/webapp lint`、`pnpm --dir apps/webapp typecheck` 与 `git diff --check`。
- 人工确认中英文长标题、50 条滚动、缓存刷新、失效占位、减少动态效果、新聊天快捷生图的正常提示词，以及桌面与移动端 GitHub 入口的分流行为。
- 发布候选将根目录与全部 workspace 的 `package.json` 锁步为 `0.5.1`；桌面包从 package version 取得运行时版本，公开预览 workflow 的默认预发布 tag 为 `v0.5.1-public-beta`。`0.5.0` 仍是 Desktop Host 的最低兼容版本与历史 Beta，不作重写。
