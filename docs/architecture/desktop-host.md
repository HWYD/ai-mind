# 桌面宿主架构

## 范围

v0.5.0 为既有在线 AI Mind Web 应用增加 Windows x64 与 macOS arm64 的 Electron 宿主；不打包 Next.js、数据库、模型、MCP、Agent Runtime 或 StreamRun 逻辑。

## 启动边界

```text
应用启动或重试
  -> 单实例锁和持久化工作区 profile
  -> Chromium `ses.fetch()` compatibility 检查
  -> 在同一 5 秒 attempt budget 内解析严格的 v1 响应
  -> 加载固定受信工作区 URL，或显示包内本地恢复页
```

只有当前且兼容的 attempt 才能加载远程工作区；过期回调不能恢复它。TLS、网络、HTTP、DTO 和首屏加载失败均进入本地恢复页。包内 Desktop Chrome 必须先完成加载，才允许创建工作区视图；若自身 bootstrap 失败，销毁未完成的 shell 并进入本地恢复。若恢复页也无法启动，native safe dialog 只允许重新走完整的固定 Origin 重试流程或退出应用。

## Renderer 隔离

| 窗口           | 内容                                             | 原生能力                               |
| -------------- | ------------------------------------------------ | -------------------------------------- |
| 工作区         | 固定的受信 HTTPS Origin                          | 没有 preload、IPC、Node 或通用文件 API |
| 恢复页         | `ai-mind-desktop://local` 包内资源               | 四个经过 sender 验证的恢复 IPC 操作    |
| Desktop Chrome | 本地 `ai-mind-desktop://local/chrome/index.html` | 只能请求既有“查看”或“帮助”原生子菜单   |

恢复 session 不持久化，且绝不继承工作区 cookie 或 cache。

宿主保留原生标题栏模型，而非绘制无边框窗口。Windows 使用浅色 `titleBarStyle: 'hidden'` 和右侧 `titleBarOverlay` 控件；macOS 使用 `hiddenInset` 并保留左侧 traffic lights。包内 Desktop Chrome 在同一行显示 AI Mind 标识及“查看”“帮助”入口，绝对定位的 drag layer 位于品牌和菜单的 `no-drag` 交互区域后方，并为平台控件保留空间。传统 application menu 行保持隐藏。工作区和恢复页各自作为该本地行下方独立的 `WebContentsView`，因此远程内容和恢复 UI 均不拥有产品菜单，也不会获得通用原生 bridge。compatibility 成功后始终加载受信 Origin 的固定 `/instant-mind` 路径。

## 安全与数据边界

- 工作区 partition 与 AppUserModelId 对同一 Windows 用户保持稳定；服务端仍是 30 天滑动会话 cookie 和所有聊天数据的唯一事实源。
- 确认重置只清理本地受信浏览器数据。关闭、崩溃、休眠和第二次启动不会发送流式取消，也不会创建第二个业务窗口。
- 导航、弹窗、外部协议、未请求权限、剪贴板读取和通用下载均被拒绝。受信图像保存是刻意收窄的原生例外，且始终使用平台保存对话框。
- 诊断仅从 allowlist 在本地复制或导出，不含用户文本、cookie、Prompt、secret、原始错误，也不会自动上传。
- 共享 Web 应用的 document CSP 对脚本保持 nonce 限制；Web 文档 CSS 严格使用 `style-src 'self' 'unsafe-inline'`，不含 style nonce/hash 或 `style-src-attr`，使受控 UI runtime style 可在 Chromium 中工作。包内 local Chrome 与恢复页采用相同 CSS 指令；该兼容例外不适用于脚本、API/static 响应、远程样式或 Electron local allowlist 外的资源。
- local Chrome 与恢复页只加载 Forge 产出的、有限 `ai-mind-desktop://local` allowlist 中的 HTML、JavaScript 和外部 CSS。其 local CSP 允许 inline CSS，但仍保持 `script-src 'self'`，不允许 `unsafe-eval`，并拒绝未列出的本地路径。renderer Webpack 使用非 eval 的 `source-map`，使开发和打包执行遵守同一脚本 CSP 边界。

## 发布边界

应用使用 Electron Forge Webpack、Windows x64 的 Squirrel.Windows 和 macOS arm64 的 DMG maker。fuses 在打包后写入，并针对真实 executable 验证。macOS `.app` 在修改 fuse 后仅进行 ad-hoc re-sign，以保持本地可执行；这不是 Developer ID 签名。v0.5.0 制品未签名、仅用于内部预览，随平台化 `desktop-release.json` 和 SHA-256 经人工受控渠道提供；拒绝 macOS Intel 与 universal binary。

发布 fuse baseline 同时禁用 `LoadBrowserProcessSpecificV8Snapshot`：Electron 43 提供 `v8_context_snapshot.bin`，未提供启用 browser-specific mode 所需的 `browser_v8_context_snapshot.bin`。这项可选优化会导致应用在 main process 执行前退出，因此真实 executable 的 fuse 检查必须拒绝其启用状态。

服务端 compatibility 和 document headers 必须先部署并验证；contract 缺失或回退会暂停预览分发，客户端保持 fail closed。生产验证器只接受 `style-src 'self' 'unsafe-inline'`，并拒绝 style nonce、hash 和 `style-src-attr`。制品可被接受前，验证器还会枚举每个真实 `app.asar` 条目，拒绝敏感文件名与禁止的发布内容，而不把 archive 当作不透明文本。

## 参考资料

- [ADR-0017](../adr/0017-secure-electron-desktop-host.md)
- [桌面端规格](../../specs/v0.5.0-electron-desktop-host/spec.md)
- [桌面预览发布契约](../../specs/v0.5.0-electron-desktop-host/contracts/desktop-preview-release.md)
