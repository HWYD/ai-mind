# Implementation Plan: AI Mind Desktop Host

**Version**: `v0.5.0` | **Branch**: `codex/v0.5.0-electron-desktop-host` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/v0.5.0-electron-desktop-host/spec.md`

## Summary

将 AI Mind 接入一个安全的 Windows x64 与 macOS arm64 Electron 桌面宿主。新增的桌面程序只承载一个构建时固定的官方 HTTPS AI Mind 服务：现有聊天、图像生成、受控 Agent、会话与流式恢复仍由线上 `apps/webapp` 和既有 Runtime 负责，桌面端不打包 Next.js 服务、数据库、模型、MCP 或 Agent Runtime。

桌面程序采用 Electron Forge + Webpack 组织。远程工作窗口没有 preload、没有 Node.js 与通用 IPC；只有受包保护的本地恢复页拥有经过逐项验证的窄 IPC。启动时主进程用 Chromium 网络栈检查一个无身份、版本化的兼容性 API；仅兼容时加载工作页面，不兼容或网络/TLS 失败时显示本地恢复页。v0.5.0 产出带稳定产品身份的 Windows x64 Squirrel 安装器和 macOS arm64 DMG，并分别提供 SHA-256 校验信息；两者以公开 GitHub Pre-release 作为 `Unsigned Experimental Preview` 提供试用，不实现 Developer ID signing、公证或自动更新。

## Technical Context

**Language/Version**: TypeScript；Node.js `>=22 <23`；Electron 使用实现时仍受官方支持的稳定主版本并锁入 pnpm lockfile；Next.js 16.1.6（现有 webapp）

**Primary Dependencies**: Electron、Electron Forge（Webpack plugin、Squirrel.Windows maker、DMG maker）、`@electron/fuses`、`electron-squirrel-startup`、仅用于图标生成的 `sharp`；现有 Next.js/React/Zod/Vitest/Turborepo

**Storage**: Windows 或 macOS 当前用户下稳定的 Chromium persistent session（cookie、IndexedDB、localStorage、cache）；服务端为桌面端和普通网页端签发连续 30 天未使用才失效的持久会话 cookie，并在每次正常会话使用时续期；PostgreSQL/StreamRun/会话模型保持不变；兼容性结果和支持诊断只在进程内短暂存在

**Testing**: Vitest（webapp route/header/contract 与 desktop pure-policy）；Playwright Electron 开发态主进程集成；Windows x64 与 macOS arm64 打包 smoke；现有 `pnpm lint`、`pnpm typecheck`、`pnpm test:stable`、`pnpm build`

**Target Platform**: Windows x64 与 macOS arm64（Apple Silicon）公开 Beta；不支持 macOS Intel x64 或 universal binary。公开 Beta 构建使用固定生产 HTTPS Origin；开发模式才允许 `localhost` Origin。`start`/`dev` 通过 Node 22 原生 `process.loadEnvFile()` 读取可选的 desktop-local 配置，缺失时只向 Forge 开发子进程注入 `http://localhost:3000`

**Project Type**: pnpm/Turborepo monorepo 中新增 desktop app，配套既有 webapp 的窄 API 与安全响应头

**Performance Goals**: 在未注入限速或故障的真实受信 HTTPS 网络路径上，从桌面进程接受首次启动请求并创建 `attemptId` 起，到 fixed Trusted AI Mind Origin 的工作窗口可见且现有聊天输入可交互止不超过 10 秒（SC-001）；验收记录 Windows 版本、Desktop Release、服务版本/compatibility state 与实测耗时。从一次启动/重试尝试开始计时，兼容性、TLS、网络、schema 或首屏加载任一失败都必须在同一个 5 秒总预算内切换到本地失败页（SC-005）

**Constraints**: 不打包本地 AI Runtime；不自动更新或代码签名；不让用户修改公开 Beta Origin；不忽略 TLS/证书/系统代理；远程内容零本机 API；无自动诊断上传或遥测；唯一允许的文件输出是用户主动保存受信图像结果

**Scale/Scope**: 一个 desktop app、一个无状态兼容性 route、一组 web 安全 header、包内本地 Desktop Chrome 与 recovery UI；不引入数据库 migration 或新的 Agent/Tool/Stream 协议

## Change Control and Existing Facts

- 当前 v0.5.0 的唯一 canonical workspace 是 `specs/v0.5.0-electron-desktop-host/`。Trusted Origin、product identity、release metadata、compatibility policy 或 document security headers 的任何变更，必须由版本负责人批准，并在此工作区同步 `spec.md`、`plan.md`、`tasks.md`、`data-model.md`、相关 contracts、research 与 acceptance evidence。
- Desktop 必须保留并且不得复制的既有 webapp 事实源：`docs/architecture/stream-recovery.md` 中的 StreamRun/hydration/cancel 语义；`apps/webapp/lib/ai/rate-limit/session-id.ts` 中的 session cookie 入口；以及 `apps/webapp/lib/ai/stream-chunk-schema.ts` 与 `apps/webapp/components/chat/message-list/parts/image-result-part.tsx` 中 image result 的 strict content path、Blob preview/download 生命周期。任务中的 desktop 测试必须证明宿主没有绕开这些边界。
- Public Beta 的 evidence record 以同一 source commit 为锚点，关联候选 installer、平台 manifest、SHA-256、server-first verification 和 GitHub Pre-release 说明；它不保存聊天、cookie、Prompt、secret 或 raw error。

## Constitution Check

_Gate: Phase 0 research 前通过，Phase 1 设计后复核。_

| 检查项             | 规划结论                                                                                                                                                                                                 | 状态 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Runtime / 分层边界 | Electron 只加载既有 webapp；不将 Tool、Skill、MCP、Agent 或数据库逻辑迁到主进程。兼容性 API 停留在 HTTP 边界。                                                                                           | 通过 |
| Stream 与取消语义  | 桌面关闭、崩溃、休眠和第二次启动不调用 cancel；继续使用 v0.4.10 的 server recovery、idempotency 与终态规则。                                                                                             | 通过 |
| 会话与数据边界     | Chromium profile 仅保存当前 Windows 用户的浏览器资料；服务端为桌面端和普通网页端签发连续 30 天未使用才失效、正常使用即续期的会话 cookie，仍是授权和数据隔离事实源；主进程不读取/记录 cookie 或聊天内容。 | 通过 |
| 安全优先           | 远程窗口 sandbox + context isolation + Node disabled，无 preload/IPC；导航、权限、下载和外部打开均 deny-by-default。                                                                                     | 通过 |
| Web 服务安全策略   | webapp 以 Next.js 16 `proxy.ts` 生成 request nonce 的 CSP，并发布 Permissions-Policy 等 header；会在真实页面资源清单上回归测试。                                                                         | 通过 |
| 发布与部署         | 服务器端兼容 API/header 仍仅走既有 GitHub Actions → TCR → server 或本地 PowerShell Ops → TCR → server 路径；桌面公开 Beta 制品构建与 hash 校验不创建第三条服务器部署路径。                               | 通过 |
| 验证               | 为公开 API、状态机、失败/重试、权限、安全边界、下载和诊断导出增加合适层级的行为测试，避免依赖脆弱文案断言。                                                                                              | 通过 |
| 文档与可维护性     | 实现结束前补 ADR、desktop architecture、版本/公开 Beta 发布说明/任务清单与 README；后续正式签名版本 release closing 再同步根版本。                                                                       | 通过 |

**Phase 1 复核**：通过。新增的本地恢复页只服务宿主自身；它不改变线上 AI Runtime，也不向远程页面暴露桥接能力。没有需要记录的宪法例外。

## Project Structure

### Documentation (this feature)

```text
specs/v0.5.0-electron-desktop-host/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── acceptance.md                 # 执行期验收证据与 release decision
├── contracts/
│   ├── desktop-compatibility-api.md
│   ├── desktop-host-policy.md
│   ├── desktop-preview-release.md
│   ├── desktop-support-diagnostic.md
│   └── web-security-headers.md
└── tasks.md                     # 由 /speckit-tasks 生成，不属于本计划产物
```

### Source Code (repository root)

```text
apps/
├── desktop/
│   ├── forge.config.ts
│   ├── package.json
│   ├── src/
│   │   ├── main/
│   │   │   ├── main.ts                 # 单实例、窗口生命周期与状态机
│   │   │   ├── build-config.ts         # 固定 Origin、产品身份和 release metadata
│   │   │   ├── compatibility.ts        # ses.fetch + 严格 compat DTO 解析
│   │   │   ├── host-state.ts           # attempt/deadline 状态机与旧回调失效
│   │   │   ├── security-policy.ts      # 导航、权限、外链、下载和证书策略
│   │   │   ├── session-profile.ts      # persistent partition 与经确认的本地重置
│   │   │   ├── diagnostics.ts          # 脱敏诊断构造与本地导出
│   │   │   ├── application-menu.ts     # 原生 About/版本入口；不向远程页开放 IPC
│   │   │   ├── desktop-chrome-bridge.ts # 仅本地 Chrome 可请求查看/帮助原生菜单
│   │   │   └── local-protocol.ts       # 受包保护的 recovery UI protocol
│   │   ├── preload/
│   │   │   ├── chrome-preload.ts       # 仅本地 Desktop Chrome 的窄菜单 bridge
│   │   │   └── recovery-preload.ts     # 仅本地 recovery 页的窄 contextBridge
│   │   ├── chrome-renderer/            # titleBarOverlay 内的产品标识与菜单触发器
│   │   └── recovery-renderer/          # 本地失败/升级/重置/诊断 UI
│   │   ├── scripts/
│   │   │   ├── verify-release-artifact.mjs
│   │   │   └── write-release-manifest.mjs
│   │   └── tests/
│   │       ├── unit/
│   │       ├── integration/
│   │       └── packaged/
├── webapp/
│   ├── app/api/desktop/compatibility/route.ts
│   ├── lib/desktop/compatibility-policy.ts
│   ├── lib/security/browser-security-headers.ts
│   ├── proxy.ts
│   └── tests/app/api/desktop/compatibility/route.test.ts
docs/
├── adr/0017-secure-electron-desktop-host.md
├── architecture/desktop-host.md
├── versions/v0.5.0-electron-desktop-host.md
├── releases/v0.5.0.md
└── tasklists/v0.5.0-electron-desktop-host-tasklist.md
```

**Structure Decision**: 保持现有 webapp 和 Runtime 结构；把所有 Electron 特有代码收束到 `apps/desktop`。webapp 只新增通用、无身份的 compatibility HTTP 边界和生产浏览器安全 header，不反向依赖 desktop app。`apps/desktop` 不被 `apps/webapp` 或 `packages/` 引用。

## Architecture & Delivery Plan

### 1. 启动与窗口状态机

```text
process start / retry
  → acquire single-instance lock
  → initialize persistent profile + security handlers
  → create attempt { id, deadlineAt = now + 5s }
  → compatibility check (Chromium session fetch, consumes same deadline)
  ├─ compatible              → remote work window
  ├─ manual_upgrade_required → packaged local recovery window
  └─ unavailable/invalid/TLS → packaged local recovery window

local recovery: retry fixed Origin | show internal-channel upgrade instruction | confirmed reset | copy/export diagnostic
```

- 兼容性通过后才调用 `loadURL(trustedOrigin)`；失败页不是从远程服务加载。
- 每次启动、重试或 reset 完成均创建一个新的 `attemptId` 和 5 秒 `deadlineAt`。兼容性请求、DTO 解析和首次 `loadURL` 共同消耗同一预算；任一步超时立即销毁/阻止远程工作窗口并进入 recovery。过期或已被后续尝试取代的异步回调必须忽略，不能把 recovery 重新切回工作窗口。
- recovery 中重复 retry 返回安全的 in-progress 结果，不并发创建 attempt。confirmed reset 使当前 attempt 立即失效并优先于 retry；清理完成或失败后才创建下一 attempt。reset 期间的 second-instance 只聚焦当前 recovery/native safe state。
- 第二次启动只聚焦已有的工作或恢复窗口；不会创建第二个会话窗口。
- 关闭窗口、`render-process-gone`、系统休眠和恢复不会创建服务端 cancel。重开后不重新挂接活动流式订阅，也不伪造完成结果；已开始的请求只按现有网页端正常 hydration 与已持久化终态规则处理。
- `did-fail-load`、兼容性超时和首屏超时在本地记录安全错误码并显示恢复页；重试重新走相同固定 Origin 和相同安全策略。
- workspace profile 初始化失败时，使用独立 recovery memory session 显示 `PROFILE_UNAVAILABLE`；若 recovery session、local protocol 或 ASAR 白名单资源本身无法安全创建，主进程使用只含 retry/exit 的 native safe dialog 显示 `LOCAL_RECOVERY_UNAVAILABLE`，并始终阻止 workspace load。

### 2. 三个显示边界

| 窗口           | 内容来源                                                      | 原生能力                                                                                  | 用途                                                                |
| -------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Desktop Chrome | 包内 `ai-mind-desktop://local/chrome/index.html` 静态页面     | 仅可请求既有 `view` 或 `help` 原生 submenu；main process 严格验证 sender、URL、枚举和坐标 | 在 `titleBarOverlay` 内同一行显示 AI Mind、查看、帮助和系统窗口控制 |
| 工作窗口       | 构建时固定的 `https://` AI Mind Origin；开发时显式本机 Origin | 无 preload、无 IPC、无 Node                                                               | 完整现有 AI Mind 页面                                               |
| 恢复窗口       | 包内 `ai-mind-desktop://local` 静态页面；不注册为 OS 协议     | 仅 `retry`、`confirmResetProfile`、`copyDiagnostic`、`exportDiagnostic` 四个具名 IPC      | 网络失败、版本不兼容、本地资料恢复和支持诊断                        |

宿主 `BrowserWindow` 使用亮色 custom title bar，并在主进程设置 `nativeTheme.themeSource = 'light'`，使原生 submenu、对话框和顶栏视觉一致。首次创建的窗口大小为 `1280 × 800`，以展示 `lg` 桌面会话侧栏；仍保留 `720 × 480` 最小尺寸，使用户主动缩小时可以进入既有响应式布局。Windows 使用 `titleBarStyle: 'hidden'` 与 `titleBarOverlay` 保留右侧系统控制；overlay 高度比 40px renderer 顶栏少 1px，以让网页底边线连续显示。macOS 使用 `titleBarStyle: 'hiddenInset'` 保留左侧 traffic lights。包内 Desktop Chrome 是 BrowserWindow 的本地 root renderer，传统 application menu 行保持隐藏。它包含一个绝对定位的 drag layer，AI Mind 标识和两个菜单位于其上方、且仅覆盖自身内容宽度的 `no-drag` 交互层；其余可见标题栏由 drag layer 接管。安全区由平台 overlay/traffic-light 约束决定，不以固定右侧 padding 假设。其下方只有一个独立 `WebContentsView`，在兼容时承载固定 `/instant-mind` workspace、失败时承载 recovery。这样产品标识与两个既有菜单不会进入远程页面，系统窗口控制也保留在同一顶栏。

在 `app.ready` 前且仅一次调用 `protocol.registerSchemesAsPrivileged`，只为 `ai-mind-desktop` 声明 `standard` 与 `secure` 所需的最小特权；不得开启 `bypassCSP`、`allowServiceWorkers`、`supportFetchAPI` 或任意外部协议关联。该 protocol 必须注册到本地 Chrome 与 recovery 共用的非持久 session，而不是默认 session。它只返回 ASAR 内、与 Forge 实际 entry 输出一致的白名单 Chrome 或 recovery HTML、JavaScript 与外部 CSS：拒绝 query、hash、路径遍历、未知 host/path、远程资源和文件路径，并为每个资源返回严格 CSP。local `style-src` 统一为 `'self' 'unsafe-inline'`，但 `script-src 'self'`、资源白名单和全部 protocol 拒绝规则保持不变。renderer webpack 显式使用非 `eval` 的 `source-map`，从而在开发态也不需要 `unsafe-eval`；改变 webpack config 后必须重启 Forge development process。

工作窗口与 compatibility client 复用 `persist:ai-mind-desktop`；恢复窗口使用独立、不带 `persist:` 前缀的 memory session。恢复页不携带线上 cookie、cache、Service Worker 或工作页权限状态。每一个 IPC handler 同时验证 sender URL、window kind、输入 schema 和用户确认状态。远程工作窗口完全没有 bridge，因此即使线上页面发生 XSS，也不能调用本机 API。

无论 workspace 是否已可用，桌面应用均通过本地 Desktop Chrome 中的“帮助 -> 关于”显示 desktop version、`public-beta`、`unsigned` 与固定 Origin。下拉菜单和版本对话框仍由 main process 本地构造，不加载远程内容、不打开升级 URL，也不向 workspace renderer 暴露 bridge。

### 3. 网络与兼容性

- 公开 Beta 构建把唯一生产 `Trusted AI Mind Origin`（`https://ai.hwyblog.cloud`）和 release metadata 编译进安装包；`app.isPackaged` 时拒绝任何 env 覆盖。开发时仅接受明确传入且经过 URL 校验的 `http://localhost` / `127.0.0.1` Origin。
- 主进程从 profile 的 `ses.fetch()` 调用 `GET /api/desktop/compatibility`，使用 Chromium 网络栈以遵守 Windows 系统代理、PAC 与 TLS 信任链；请求使用 `credentials: 'omit'`，不需要身份，也不读取、写入或续期 profile cookie。请求的 AbortSignal 只使用当前 `attempt` 剩余的总时间，不能另起一个 5 秒计时器。
- response 必须满足 strict JSON contract。错误状态、非 2xx、超时、网络错误、证书错误或 schema 错误一律视为 `unavailable`；绝不先加载远程工作页面再补查。
- `compatible` 才进入工作窗口；`manual_upgrade_required` 只显示本地恢复页中的“从 GitHub Pre-release 获取较新 Unsigned Experimental Preview”说明和最低版本，不展示、不打开升级 URL。升级制品仅通过 GitHub Pre-release 提供，不能通过应用内外链绕过发布边界。

### 4. Electron 安全基线

**Implementation update (2026-08-04)**: the Windows external-opening behavior gate found that Electron 43 reports identical `foreground-tab` / empty-body metadata for real pointer and keyboard `target=_blank` activation, `window.open`, and synthetic click. As those vectors cannot be safely distinguished, `setWindowOpenHandler` has an empty external allowlist and never calls `shell.openExternal` in v0.5.0. POST form target remains separately identifiable through body data and is also denied.

- 所有 renderer 均显式 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`、`allowRunningInsecureContent: false`、`webviewTag: false`；不启用 experimental/Blink feature，不加载扩展。
- `will-navigate`、`will-frame-navigate` 与 `will-redirect` 只允许工作窗口的 exact trusted Origin。由于 Windows behavior gate 证明当前 Electron fields 无法稳定区分用户操作和脚本执行，`setWindowOpenHandler` 永远返回 `deny`，v0.5.0 不导入或调用 `shell.openExternal`，也绝不通过页面 IPC 或自造“输入令牌”授权外链。所有 `target=_blank`、`window.open`、form target、脚本/合成打开，以及 `file:`、`data:`、`javascript:` 与自定义协议均拒绝。
- session 同时安装 `setPermissionCheckHandler` 和 `setPermissionRequestHandler`。除 trusted main frame 的 `clipboard-sanitized-write` 外一律拒绝；浏览器自身的 transient user activation 仍是文本写入的前提。`clipboard-read`、`fileSystem`、notification、media、display capture、USB/HID/serial、Bluetooth、location 等全部拒绝。
- 不设置 `setCertificateVerifyProc`，不监听/接受 `certificate-error`，不设置自定义代理，不使用 Node HTTP client 访问服务。
- 打包前烧录 fuses：禁用 RunAsNode、Node options、Node inspect arguments 与 browser-process-specific V8 snapshot；启用 cookie encryption、ASAR integrity validation 与 only-load-app-from-ASAR。Electron 43 发布包不含后者所需的 `browser_v8_context_snapshot.bin`，启用会使应用在主进程执行前退出。fuse 选择和产物实际值均纳入验证。

### 5. 本地 profile、下载与诊断

- 使用稳定 product identity、AppUserModelId、`persist:` partition 和同一 userData 路径。手动安装覆盖时不迁移或删除该 profile；服务端必须将会话 cookie 以 `HttpOnly`、`SameSite=Lax`、生产环境 `Secure`、`Max-Age=2592000`（30 天）和等价 `Expires` 属性写入响应，且此策略同时适用于桌面端与普通网页端。这里的“正常会话请求”精确定义为所有通过既有 `resolveSessionId()` 成功取得 session 的第一方 session-bound API handler（聊天、会话、run、Agent 与 cancel 等）；它们均重写 cookie 续期。`GET /api/desktop/compatibility` 不调用该 helper，始终不读、写或续期 cookie。Electron cookie encryption 依赖 Windows OS 密钥保护 cookie store，主进程不得读写 cookie 值。
- 经确认的“重置本地资料”先关闭/销毁工作窗口，调用 session 的定向 `clearData`（cookies、cache、IndexedDB、localStorage、service workers、downloads 等），只针对 trusted Origin；完成后重新检查兼容性。它不调用任何删除服务端会话/记忆的 API。
- `will-download` 默认 cancel。仅当来源是当前 trusted 工作窗口 main frame、`DownloadItem.hasUserGesture()` 为真、URL chain 只有一个嵌入 Origin 等于 trusted Origin 的 Blob URL，并且该 URL 来自当前 ImageResult UI 读取 strict `/api/chat/runs/<runId>/image` 内容路径后的 Blob、文件名与 MIME 是允许的图片时，才保留下载并通过 `DownloadItem.setSaveDialogOptions` 弹出系统保存对话框。绝不直接放行 content route、任意同源 URL、静默保存路径，也不接受页面/IPC 传入的保存路径或用户手势声明；Blob 在保存前失效或下载被中断时不得留下部分文件或 fallback。
- Desktop Support Diagnostic 用固定 allowlist 从 build config、状态机和安全网络错误构建。用户可复制到剪贴板或保存文本；没有网络上传代码和 telemetry endpoint。

### 6. Web 服务配套改动

- 新增无身份、无副作用的 `GET /api/desktop/compatibility`。服务端以一个版本化 policy 判断最小支持 Desktop Release，响应 `compatible` 或 `manual_upgrade_required`；不返回升级 URL、用户资料、密钥或内部配置。
- 新增 `apps/webapp/proxy.ts`。CSP 采用明确的分路由策略：仅 HTML document 请求进入 nonce proxy（`/`、`/instant-mind` 及未来页面）；`/api/**`、`/_next/static/**`、`/_next/image/**`、favicon 与 prefetch 跳过 nonce 生成，保留各自正确的 API/cache 语义。document 请求每次生成 nonce 并使受保护页面动态渲染；这是为安全选择的性能代价，不能悄悄扩大 matcher 到静态资源或 API。生产 CSP 使用 nonce + `strict-dynamic` 限制脚本；Web document 与本地 Chrome/recovery 的全部 CSS 通过 `style-src 'self' 'unsafe-inline'` 生效，且 `style-src` 不得含 nonce/hash，也不得设置 `style-src-attr` 覆盖该统一规则。本地例外不扩展到 `script-src`、API/static 响应、远程样式来源或 ASAR 资源白名单之外。禁止 object、外部 frame、不安全脚本和宽泛 source。一起设置 `Permissions-Policy`（禁用本版未声明的硬件/媒体能力）、`Referrer-Policy`、`X-Content-Type-Options` 和 frame 防护；资源 inventory、header contract 与浏览器布局回归必须同步验证。
- `/instant-mind` 的移动会话栏与受限聊天内容列分层：小于 `lg` 时，会话栏位于页面外层 padding 内并通过既有负外边距通栏；标题、消息和输入区继续使用 `53.5rem` 内容列。`lg` 及以上仍由桌面会话侧栏负责导航，不改变 Electron 原生菜单。
- 兼容性 API 和既有运行时不共享服务端会话或 Agent 状态。该 endpoint 不能成为新的用户身份、环境切换或远程配置入口。

### 7. Windows x64 与 macOS arm64 公开 Beta 制品、发布顺序与回退边界

- 用 Forge 的 Squirrel.Windows maker 生成 Windows x64 安装器，并用 DMG maker 在原生 macOS arm64 runner 生成 macOS arm64 DMG；处理 Squirrel 启动参数时只在 Windows 生效，保持稳定的 package/product/AppUserModelId 与 macOS bundle identifier。由仓库内透明 PNG 母版生成同源 `.ico` 与 `.icns`，`packagerConfig.icon` 嵌入已打包应用，Squirrel `setupIcon` 覆盖 `Setup.exe` 与 `Update.exe`；不通过 `iconUrl` 增加安装时远程图标依赖。
- `make` 只产生可测试构件；`preview:make` 产生公开 Beta 构件，不调用 Authenticode、Azure Artifact Signing、Apple Developer ID 或 notarization 服务。macOS 在 fuse 修改后仅可使用本机构建完整性所需的 ad-hoc `codesign --sign -` 重签名，不能将其标记为签名发行物。安装包、安装后应用内版本页与配套说明必须显著标记“Unsigned Experimental Preview”；macOS 说明必须记录 Gatekeeper 的用户主动打开步骤。
- 为每个公开 Beta 制品生成平台化 `desktop-release-<platform>.json` 与 SHA-256 校验文件，记录 source commit、desktop version、`win32-x64` 或 `darwin-arm64`、Electron version、可信 Origin、`distribution: public-beta`、`signing: unsigned` 和 hash，并作为公开 GitHub Pre-release 的资产提供。
- artifact verifier 必须同时检查实际 packaged app，而非只检查 manifest：它必须枚举每个 `app.asar` 的真实条目并检查其中的文件名和内容，ASAR/资源清单不得含 `.env`、私钥、签名凭据、用户 profile 或未声明配置；production build config 必须只有固定 Origin 与允许的 release metadata，且没有 dev Origin fallback、`autoUpdater` 或 telemetry endpoint。安装后 native About/版本入口与配套说明必须显著标记“Unsigned Experimental Preview”。
- 不引入 `autoUpdater`、update server、后台更新检查或安装器自动下载。Squirrel 的 `RELEASES` 元数据只是 maker 产物，不代表启用自动更新。
- **先服务端、后桌面包**：Windows/macOS CI 可以提前生成不可分发的 `make:windows`/`make:macos-arm64` 测试构件来验证打包与 fuses，但不得把它们上传或标记为公开发布候选。先经既有两条正式 server deploy route 发布 compatibility API 与 document security headers；生产验证脚本只接受严格 semver 的 `AI_MIND_DESKTOP_CANDIDATE_VERSION` 参数，并以它发送 desktop version header。该脚本还必须确认 PostgreSQL `5432` 和 project-assistant-service `8788` 没有宿主机映射，并且只将成功的 `docker compose port` 结果视为映射，不能把 CLI 失败文字误判为暴露。只有这些线上验证通过后，维护者才能对同一 commit 手动触发 `desktop-public-preview.yml`，生成 manifest/hash 并创建公开 GitHub Pre-release。该参数仅属于 release verification，不是 desktop runtime config、Origin override 或用户可编辑值。
- **回退规则**：只要某个公开 Beta 制品仍可下载，线上服务不能回退到缺少 compatibility API 或安全 headers 的版本。若必须回退，先暂停对应 Release；已安装客户端继续 fail closed 到 recovery，不增加客户端 URL fallback、旧协议容忍或 HTTP 降级。

### 8. Windows x64 与 macOS arm64 CI、测试车道与验收证据

| 层级                              | 必须证明的行为                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| webapp unit/route                 | compatibility strict DTO、semver policy、无身份/无缓存 header、CSP nonce、Permissions-Policy，以及桌面端与普通网页端均收到“正常会话使用即续期、30 天未使用失效”的 cookie；兼容性 API 不得读写或续期 cookie                                                                                                           |
| desktop unit                      | build config、URL/Origin parser、状态转换、错误码 allowlist、diagnostic redaction、safe filename/MIME、release manifest                                                                                                                                                                                              |
| desktop main integration          | 使用未打包 development Electron 进程的 Playwright Electron 实验性支持，验证无 preload 的远程窗口、所有 navigation/redirect/popup/permission 拒绝、5 秒总 deadline、reset 与单实例行为，以及 close/crash 不发送 cancel、不重新挂接活动流式订阅。测试不可向生产代码加入 test-only IPC、开关或回退分支                  |
| external-opening feasibility gate | 首先在 Windows 上为真实 pointer/keyboard `target=_blank`、`window.open`、synthetic click、form target 分别采集 `setWindowOpenHandler` 的 Electron fields。只有能被 `url`、`disposition`、`postBody` 与 main-frame 来源稳定区分的真实用户外链可打开系统浏览器；不能可靠区分的向量保持 deny，不能以时间输入令牌放宽    |
| desktop download/clipboard        | 基于 `DownloadItem.hasUserGesture()`、main-frame 来源和完整 URL chain 验证合法用户点击图像结果显示系统保存流程；自动、redirect、非受信/不安全下载、clipboard read 与未声明权限被拒绝；trusted copy 写入只在用户激活下成功                                                                                            |
| packaged Windows smoke            | 使用生产验证通过后发布的公开 Beta 制品做首次启动、正常聊天、图像保存、Agent、会话重启连续性、流式回答关闭后只读取已持久化终态且不重新挂接订阅、compatible/manual-upgrade/unavailable 三状态、`public-beta` 标识/原生版本入口/包内容/fuse/hash 验证。由于生产 fuses 禁止 Node inspect，此车道不依赖 Playwright attach |
| regressions                       | 当前 webapp 的聊天、图像、Agent、stream-core 与 production build 检查继续通过                                                                                                                                                                                                                                        |

CI 维持现有 Ubuntu web 车道，并新增 Windows x64 与 macOS arm64 desktop 车道：安装锁定依赖并保留仅在 runner 工作区内的 install log/report，执行 `verify-pnpm-builds.mjs` 证明实际 Node/pnpm、Electron/Forge binary 与精确 `allowBuilds` 清单；随后运行 desktop pure-policy/unit、启动未打包 development integration、执行仅供 CI 的 `make:windows`/`make:macos-arm64`、验证 fuses 与包内容审计。macOS 车道必须在 `macos-14` ARM64 runner 上运行并断言 `darwin-arm64` 产物，禁止交叉构建或错误输出 Intel/universal 包。CI 成功是 future public Beta candidate 的必要条件，但不能代替生产 server 验证，也不能产生可分发 release asset；server deploy 仍不由此车道执行。按 Electron/Forge 实际需要在 pnpm 的 `allowBuilds` 精确列出包名，禁止为了下载 binary 开启宽泛安装脚本。平台契约固定为 Windows x64 启用 `electron` 与 `electron-winstaller`，macOS arm64 启用 `electron`、`fs-xattr` 与 `macos-alias`；macOS clean-install verifier 必须在 Forge make 前实际加载后两个原生模块，证明 DMG 链路所需的 `xattr.node` 与 `volume.node` 已构建。macOS artifact verifier 通过 `pnpm --dir apps/desktop` 执行时，DMG 和 package directory 必须先解析为绝对 workspace 路径，禁止依赖调用方 cwd。

测试按角色、状态、交互结果和 DTO 断言；不以可变整段中文提示文案作为主要断言。所有人工 smoke 记录 Windows 版本、Desktop Release、服务版本/兼容性状态与结果，但不采集用户内容或 cookie。

## Complexity Tracking

## Release Closing Evidence

### Current Execution Order: 2026-08-06

为避免“已完成的后续开发”与“尚未满足的 operational release gate”交错，v0.5.0 的实际执行顺序固定为：

1. Phase 1-9：基础、用户故事、仓库级 CI/发布准备和规格资产。
2. Phase 10：完成已有 evidence 漂移的收敛基线（T070）。
3. Phase 11：开发入口、本地中文化与本地 Desktop Chrome follow-up（T076-T077、T086-T105）。
4. Phase 12：macOS arm64 DMG、平台化 artifact contract、原生 CI 与验收路线（T078-T085）。
5. Phase 12.5：完成 pre-release audit remediation，收紧 production CSP verifier、local bootstrap fail-closed 与实际 ASAR 条目审计（T106-T109）。
6. Phase 14：完成 public-beta metadata、公开发布 Workflow、中文文档和本地验证（T115-T119）。
7. Phase 13：仅在前述代码和质量门禁全部完成后，由维护者执行 source commit 合并、既有 server deploy、production verification、公开 GitHub Pre-release、双平台 fresh-install smoke 和最终 sign-off（T071-T075）。

T071-T075 的编号保留为历史追溯标识，不能据编号跳过 Phase 11、Phase 12、remediation 或 Phase 14；它们是当前版本唯一尚未开始的运营发布路径。

### Current Evidence Status

维护者已将此前 v0.5.0 代码合并到 `main` 并部署线上；本工作区新增的 public-beta
metadata 与公开发布 Workflow 尚待合并和部署。当前生产 verifier、公开 GitHub
Pre-release 与 Windows/macOS arm64 fresh-install 证据均未执行。只有包含 T115-T119
的同一 candidate 被部署并通过 `verify-production.sh` 后，维护者才能手动创建公开 Release。

无宪法例外。`apps/desktop` 是 v0.5.0 的产品边界，不是为了抽象而新增的通用 Runtime；本地恢复页与远程工作页分开是限制特权暴露所必需的安全隔离。
