# ADR-0017：安全的 Electron 桌面宿主

**状态**：已接受用于 v0.5.0 公开 Beta；运营发布门槛待完成

## 背景

AI Mind 需要 Windows x64 与 Apple Silicon macOS 的桌面入口，但不能将既有 Web 应用、AI Runtime、数据层、Tool、Skill、MCP、Agent 或 StreamRun 的职责复制到第二套 Runtime。受信服务不可用或不兼容时，桌面宿主必须 fail closed，同时保持既有 Web 会话和 Stream recovery 语义。

## 决策

- 应用是 Electron Forge Webpack 宿主，只允许一个构建时固定的 HTTPS Origin。未打包开发模式可使用显式 localhost Origin；打包版本拒绝全部运行时覆盖。
- 远程工作区使用 `sandbox`、context isolation、禁用 Node integration，不加载 preload，也不提供 IPC bridge。唯一的 preload 和经 sender 验证的 IPC 仅属于包内本地恢复页。
- Windows 使用浅色 `titleBarStyle: 'hidden'` 与右侧 `titleBarOverlay`；macOS 使用 `hiddenInset` 并保留原生左侧 traffic lights。包内 Desktop Chrome 在同一行渲染 AI Mind 标识及“查看”“帮助”入口，绝对 drag layer 位于 `no-drag` 交互区后方。其 bridge 仅在精确验证 sender、URL、枚举值和标题栏坐标后请求这两个由 main process 拥有的原生子菜单；远程工作区仍是 zero-bridge，compatibility 成功后加载固定 `/instant-mind`。
- Chromium session 的 compatibility 请求必须先返回严格的 v1 compatibility DTO，宿主才可加载工作区。网络、TLS、schema、超时和首屏加载失败都保留在本地，并 fail closed 到恢复页。local Desktop Chrome bootstrap 完成前不得准入工作区；bootstrap 失败时销毁未完成 shell 并走相同恢复路径。若 local recovery 无法启动，native safe dialog 只允许完整的固定 Origin 重试或退出应用。
- 工作区 profile 按 Windows 用户持久化；恢复页使用独立 memory session。确认重置只清理本地受信浏览器数据，绝不删除服务端数据。
- 导航、弹窗创建、外部打开和权限均为 deny-by-default。Electron 43 无法可靠区分真实用户外链激活和多种不安全向量，因此 v0.5.0 不提供外部打开 allowlist。
- 文件输出仅限受信页面、用户主动触发的图像下载，并打开原生保存对话框。剪贴板读取和通用文件 API 均不可用。
- production fuses 保护 cookie encryption 和 ASAR 加载。Windows x64 使用 Squirrel，macOS arm64 使用 DMG；两者都是未签名公开 Beta，通过 GitHub Pre-release 标记为 `Unsigned Experimental Preview`，不包含自动更新、Developer ID 签名、公证、Intel target 或 universal binary。macOS 的 fuse 修改后仅做 ad-hoc re-sign，不具有发布者身份。`LoadBrowserProcessSpecificV8Snapshot` 保持禁用，因为 Electron 43 未提供其所需的 `browser_v8_context_snapshot.bin`；这是运行时兼容性限制，不降低 Node 或 ASAR security fuse baseline。
- 只有同一服务端 commit 通过既有部署链路的 production compatibility 和 document-header 验证后，才可手动创建 GitHub Pre-release。生产验证器只接受 `style-src 'self' 'unsafe-inline'`，并拒绝 style nonce/hash 和 `style-src-attr`。
- Web 应用 CSP 对脚本保持 nonce 限制；其 Web document CSS 严格使用 `style-src 'self' 'unsafe-inline'`，不含 style nonce/hash 或 `style-src-attr`，以支持 Chromium 中受控的 UI runtime style。打包 Electron local document 使用同一 CSS 指令；该例外不授予脚本执行，也不适用于 API/static 响应、远程样式或 local allowlist 外资源。
- local Chrome 与恢复页使用 Forge 产出的 HTML、JavaScript 和外部 CSS 精确 allowlist。`style-src 'self' 'unsafe-inline'` 不放宽 `script-src 'self'`、`unsafe-eval` 或资源 allowlist；其 renderer Webpack 使用非 eval 的 `source-map`，使开发与打包脚本执行处于同一 CSP 边界。
- 制品验证读取真实 fuse state 并枚举每个 `app.asar` 条目，因此 `.env`、私钥/签名凭据文件名、私钥/证书内容和 `autoUpdater` 内容无法隐藏在 archive 中。

## 结果

Web 应用仍是聊天、图像生成、受控 Agent、会话授权和 Stream recovery 的事实源。桌面进程只负责宿主安全、窗口生命周期、本地恢复、profile 隔离和收窄的原生保存行为。

本版本不提供离线 AI 操作、可编辑服务地址、代码签名、自动更新、诊断上传、SSO callback 处理或通用原生 API。

## 参考资料

- `specs/v0.5.0-electron-desktop-host/spec.md`
- `docs/architecture/desktop-host.md`
- `docs/architecture/production-deployment.md`
