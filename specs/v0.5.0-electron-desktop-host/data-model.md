# Data Model: AI Mind Desktop Host

**Feature**: v0.5.0 Electron Desktop Host
**Date**: 2026-08-03

## Model Boundaries

v0.5.0 不新增业务数据库表。以下对象划清 Electron 本地状态、线上业务状态和临时 UI 状态；它们不能互相替代。

| State                           | Source of Truth                                          | Lifetime                                                          | Contains                                                                        | Must not contain                                      |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DesktopBuildConfig`            | public-beta desktop build 的包内常量                     | public-beta 生命周期                                              | desktop version、固定 Origin、产品 identity、distribution 标记                  | 用户配置、secret、升级 URL、任意 server URL、签名凭据 |
| `DesktopPreviewManifest`        | 打包后基于实际安装器生成的只读文件                       | 单个公开 Beta 制品生命周期                                        | version、platform、Electron version、可信 Origin、public-beta/unsigned、SHA-256 | secret、签名凭据、用户资料、任意下载地址              |
| `DesktopSessionProfile`         | 当前 Windows 或 macOS 用户的 Chromium persistent session | 手动 reset 前持续；其中服务端会话 cookie 在连续 30 天未使用后失效 | cookie、IndexedDB、localStorage、cache、现有 browser snapshot                   | 服务端密钥、数据库凭据、主进程业务状态                |
| `DesktopCompatibilityState`     | 启动期服务器响应与本地安全错误                           | 当前 app process                                                  | compatible/upgrade/unavailable、safe code、retry time                           | 聊天内容、cookie、原始 exception/TLS 详情             |
| `DesktopRecoverySession`        | Electron 非持久 memory session                           | 单个 recovery window 生命周期                                     | 包内 protocol、recovery CSP、最小 IPC 所需状态                                  | 线上 cookie、cache、Service Worker、工作页权限状态    |
| `DesktopHostState`              | Electron main process                                    | 当前 app process                                                  | bootstrap/window kind/attempt/deadline/compat state                             | StreamRun、Agent state、用户业务数据                  |
| `DesktopSupportDiagnostic`      | 从 allowlist 投影的本地对象                              | 用户复制/导出时                                                   | release/platform/origin/compatibility/safe error                                | Prompt、chat、image、cookie、token、secret、内部配置  |
| `DesktopDownloadRequest`        | `will-download` 事件与 Electron 原生 user gesture        | 单次下载                                                          | source kind、sanitized filename、URL chain 结论、approved/denied reason         | 任意 filesystem path、文件内容、浏览器 cookie         |
| Existing webapp/StreamRun state | 线上 AI Mind 服务                                        | 既有 retention/会话生命周期                                       | chat、Agent、image、idempotency、cursor、cancel                                 | Electron 专属本地实现细节                             |

## Entities

### DesktopBuildConfig

```ts
type DesktopBuildConfig = {
    productId: 'cloud.hwyblog.ai-mind.desktop'
    appUserModelId: 'cloud.hwyblog.ai-mind.desktop'
    desktopVersion: string
    channel: 'production' | 'development'
    distribution: 'public-beta'
    signing: 'unsigned'
    trustedOrigin: string
    compatibilityPath: '/api/desktop/compatibility'
    compatibilityContractVersion: 1
}
```

**Invariants**:

- `channel === 'production'` 时 `trustedOrigin` 必须是唯一的 absolute `https:` Origin，且没有 query/hash/userinfo；不存在运行时覆盖。
- `channel === 'development'` 才可使用显式 `http://localhost` 或 `http://127.0.0.1`；无法解析、非 local 或 production build 的 env 覆盖都使启动失败到本地 recovery，而非回退到任意地址。
- v0.5.0 不保存、显示或打开任何升级 URL。`manual_upgrade_required` 只显示最低支持版本与“从 GitHub Pre-release 获取较新 Unsigned Experimental Preview”的固定说明；兼容性 API 不提供升级 URL。
- `distribution: 'public-beta'` 与 `signing: 'unsigned'` 是 v0.5.0 的固定值；任何改为已签名或自动更新的构建必须在后续版本重新进行发布设计与验收。
- 打包 fuse 属于 `DesktopBuildConfig` 的发布基线；Electron 43 的 `LoadBrowserProcessSpecificV8Snapshot` 必须为禁用，因为其发行包不携带所需的 `browser_v8_context_snapshot.bin`。实际 executable 的 fuse wire 与启动 smoke 是该不变量的验证证据。

### DesktopPreviewManifest

```ts
type DesktopPreviewManifest = {
    desktopVersion: string
    sourceCommit: string
    platform: 'win32-x64' | 'darwin-arm64'
    electronVersion: string
    trustedOrigin: string
    distribution: 'public-beta'
    signing: 'unsigned'
    sha256: string
}
```

**Invariants**:

- manifest 必须在安装器产物生成后计算，并与该产物的实际 SHA-256 一致。
- `sourceCommit` 必须是产生 installer、server-first production verification 和 manifest 的同一 commit；它只用于候选审计，不是 runtime config。
- manifest 只能与显著标记“Unsigned Experimental Preview”的安装器在同一公开 GitHub Pre-release 提供；它不替代正式发行所需的代码签名。
- manifest 不包含下载 URL、用户资料、密钥、签名凭据或服务端内部配置。

### DesktopSessionProfile

```ts
type DesktopSessionProfile = {
    partition: 'persist:ai-mind-desktop'
    ownerScope: 'current-os-user'
    trustedOrigin: string
    cookieEncryption: 'required'
    serverSessionCookieTtlSeconds: 2592000
    serverSessionCookieRenewal: 'sliding-on-session-use'
    resetState: 'ready' | 'confirming' | 'clearing' | 'cleared' | 'failed'
}
```

**Invariants**:

- profile 路径和 partition 在同一 product identity 的手动覆盖安装间保持不变。
- 工作窗口和 compatibility client 必须复用这一 persistent partition；recovery window 必须使用下方独立的非持久 session，不创建隐式的临时**业务** session。
- 线上服务同时向桌面端和普通网页端签发连续 30 天未使用才失效的持久会话 cookie；每个成功解析既有会话的正常会话请求都会滚动续期。cookie 的授权与失效判断仍完全由服务端负责，Electron 主进程不读取、构造或续期 cookie 值。
- reset 只在用户确认后发生，并只删除该 desktop profile 中与 trusted Origin 匹配的浏览器数据类型。它不会请求 server 删除会话、记忆或 StreamRun。
- reset 前销毁远程工作窗口；完成/失败后都重新进入 compatibility check，避免旧 renderer 继续持有陈旧 profile。

### DesktopRecoverySession

```ts
type DesktopRecoverySession = {
    partition: 'ai-mind-desktop-recovery'
    persistence: 'memory-only'
    protocolHost: 'local'
    allowsNetwork: false
}
```

**Invariants**:

- recovery session 通过不带 `persist:` 前缀的 `session.fromPartition()` 创建；每次进程重启均为空，不能复用 workspace cookie、cache、IndexedDB、Service Worker 或 permission grant。
- `ai-mind-desktop` protocol 必须注册到此 session；它仅解析 ASAR 白名单资源，且 response 带 recovery 专用 CSP。
- recovery session 禁止网络请求、外部 navigation、下载和所有非 recovery bridge permission；它不是离线业务数据层。

### DesktopCompatibilityState

```ts
type DesktopCompatibilityState =
    | {
          kind: 'compatible'
          checkedAt: string
          contractVersion: 1
      }
    | {
          kind: 'manual_upgrade_required'
          checkedAt: string
          minimumDesktopVersion: string
      }
    | {
          kind: 'unavailable'
          checkedAt: string
          errorCode:
              | 'COMPATIBILITY_TIMEOUT'
              | 'NETWORK_UNAVAILABLE'
              | 'TLS_VALIDATION_FAILED'
              | 'COMPATIBILITY_HTTP_FAILED'
              | 'COMPATIBILITY_CONTRACT_INVALID'
              | 'PROFILE_UNAVAILABLE'
              | 'LOCAL_RECOVERY_UNAVAILABLE'
              | 'WORKSPACE_LOAD_FAILED'
              | 'WORKSPACE_LOAD_TIMEOUT'
      }
```

**Invariants**:

- 只有 `compatible` 能创建或保留远程工作窗口。
- server 未知 status、未知字段、错误 content type、过时 contract version 都映射为 `COMPATIBILITY_CONTRACT_INVALID`。
- `manual_upgrade_required` 不是 `unavailable` 的同义词：它必须显示最低支持 release 与 GitHub Pre-release 升级说明，但不提供应用内升级链接。
- UI 显示的是 safe code 和可理解建议，不显示 raw network stack、证书主体或服务内部错误。

### DesktopHostState

```ts
type DesktopHostState = {
    phase: 'bootstrapping' | 'checking_compatibility' | 'loading_workspace' | 'workspace_ready' | 'recovery'
    activeWindow: 'workspace' | 'recovery' | null
    compatibility: DesktopCompatibilityState | null
    attemptId: number
    deadlineAt: number
}
```

**Valid transitions**:

```text
bootstrapping → checking_compatibility
checking_compatibility → loading_workspace | recovery
loading_workspace → workspace_ready | recovery
workspace_ready → checking_compatibility (explicit reload only) | recovery (load/crash failure)
recovery → checking_compatibility (retry/reset complete) | recovery
```

每次进入 `checking_compatibility` 都生成新的 `attemptId` 与 `deadlineAt = startedAt + 5000ms`；compatibility fetch、响应解析和 workspace 首屏加载共享这一个 deadline。异步回调只有在自身 `attemptId` 仍等于当前值且未超过 `deadlineAt` 时才能变更状态；超时或旧 attempt 回调一律不能创建/恢复 workspace。

`second-instance` 不改变上述状态，只聚焦 `activeWindow`。窗口关闭、renderer crash 或系统睡眠不产生 server cancel transition；重新创建工作窗口后也不创建恢复活动流式订阅的 transition，只按既有 hydration 读取已持久化终态。

**Concurrency and bootstrap failure priority**:

1. recovery 状态中的 retry 只有在没有 checking/reset 操作时才能创建新 attempt；其他 retry 返回安全的 `already_in_progress`，不并行发起请求。
2. confirmed reset 优先于 retry：先使当前 `attemptId` 失效、销毁 workspace，再开始定向清理；清理完成或失败后才创建下一次 compatibility attempt。
3. reset 期间的 `second-instance` 只聚焦现有 recovery/native safe state，不能创建窗口、attempt 或 server request。
4. workspace profile 初始化失败时进入独立 recovery session 并保存 `PROFILE_UNAVAILABLE`；recovery session、protocol、ASAR 白名单资源或本地 Desktop Chrome bootstrap 无法安全创建时，销毁未初始化的本地 shell、不加载 workspace，而由 main process 显示带 `LOCAL_RECOVERY_UNAVAILABLE` 的 native safe dialog。
5. native safe dialog 的 `retry` 在用户明确选择后重新执行固定 Origin 的完整 attempt；`exit` 终止应用。二者都不暴露 raw error，也不允许直接进入 workspace。

### DesktopDownloadRequest

```ts
type DesktopDownloadRequest = {
    source: 'trusted-image-blob'
    originatingWebContentsId: number
    requestedFilename: string
    allowedMimeType: 'image/png' | 'image/jpeg' | 'image/webp'
    hasUserGesture: boolean
    urlChainLength: number
    outcome: 'approved' | 'denied' | 'cancelled' | 'completed' | 'interrupted'
    safeReasonCode?: string
}
```

**Invariants**:

- source 必须属于当前 trusted workspace main frame；recovery 页、subframe、任意 `file:`/custom protocol/HTTP/外站一律拒绝。
- `trusted-image-blob` 仅指现有 ImageResult UI 在受信 main frame 内成功读取严格 `image-result-ready.contentPath` 后创建的 Blob URL；该 content path 固定为 `/api/chat/runs/<runId>/image`，并且 `<runId>` 必须与 strict stream chunk 的 `runId` 一致。main process 只放行嵌入 Origin 与 `DesktopBuildConfig.trustedOrigin` 完全一致的 Blob URL，不直接放行 content route 或任意同源 URL。
- 文件名无 path separator、control character、Windows/macOS reserved name 或 MIME/extension 不匹配；不安全时取消下载。
- `DownloadItem.hasUserGesture()` 必须为真；它由 Electron 事件提供，页面/IPC 不能构造或覆盖。
- `getURLChain()` 必须只有一个受信 URL，任何 redirect 或 URL chain 中的非受信 scheme/origin 都取消下载。
- 获准后只调用 `DownloadItem.setSaveDialogOptions`，由用户选择保存位置；本应用不传入或持久化任意 file path。
- Blob URL 在 native save 确认前已失效、下载被中断或用户取消保存时，结果只能是 `denied`、`interrupted` 或 `cancelled`，不得遗留部分文件或静默重试。

### DesktopSupportDiagnostic

```ts
type DesktopSupportDiagnostic = {
    schemaVersion: 1
    generatedAt: string
    desktopRelease: string
    electronVersion: string
    chromiumVersion: string
    platform: 'win32' | 'darwin'
    architecture: 'x64'
    trustedOrigin: string
    compatibility: DesktopCompatibilityState['kind'] | 'not_checked'
    safeNetworkErrorCode?:
        | 'COMPATIBILITY_TIMEOUT'
        | 'NETWORK_UNAVAILABLE'
        | 'TLS_VALIDATION_FAILED'
        | 'COMPATIBILITY_HTTP_FAILED'
        | 'COMPATIBILITY_CONTRACT_INVALID'
        | 'PROFILE_UNAVAILABLE'
        | 'LOCAL_RECOVERY_UNAVAILABLE'
        | 'WORKSPACE_LOAD_FAILED'
        | 'WORKSPACE_LOAD_TIMEOUT'
}
```

**Invariants**:

- 使用 fixed allowlist 构造，禁止把 `Error`、request/response headers、URL path/query、cookie、localStorage、聊天、Prompt 或 config object 序列化进去。
- 只可由 recovery 页用户操作触发 copy/export；未触发时不写文件、不发 HTTP 请求、不发送 telemetry。
- export 使用本地保存对话框，默认文本扩展名 `.txt`；copy 使用 recovery 页的窄 IPC。两者均返回成功/取消/失败的安全状态。

## Data Classification

| Data                         | Persistent desktop profile                                  | Main-process memory   | Server compatibility API | Diagnostic    | Log            |
| ---------------------------- | ----------------------------------------------------------- | --------------------- | ------------------------ | ------------- | -------------- |
| session cookie               | 是，OS encryption；正常会话使用即续期，连续 30 天未使用失效 | 不读取值              | 否                       | 否            | 否             |
| local conversation snapshot  | 是                                                          | 否                    | 否                       | 否            | 否             |
| trusted Origin               | build config                                                | 是                    | request target           | 是，仅 origin | 可以           |
| desktop/server compatibility | 否                                                          | 是                    | response                 | 是            | safe code only |
| raw TLS/network error        | 否                                                          | 短暂                  | 否                       | 否            | 否             |
| chat/image/Prompt/secret     | 既有网页自身需要的资料                                      | 不读取                | 否                       | 否            | 否             |
| selected save path           | 不持久化                                                    | 仅 Electron save flow | 否                       | 否            | 否             |

## Reset and Upgrade Semantics

| Action                                        | Desktop profile                      | Server data    | Window result                                              |
| --------------------------------------------- | ------------------------------------ | -------------- | ---------------------------------------------------------- |
| Normal app close/reopen（连续 30 天未使用前） | 保留                                 | 不变           | compatibility check 后复用 profile 和有效会话              |
| Same-product manual upgrade                   | 保留                                 | 不变           | 新 binary 使用同一 partition/path                          |
| User confirms local reset                     | 定向清除 trusted Origin browser data | 不调用删除 API | 回到 compatibility check，服务端按新/失效 session 决定访问 |
| Network/TLS/compatibility failure             | 保留                                 | 不变           | 仅 local recovery page                                     |
| Renderer crash/hibernate                      | 保留                                 | 不发 cancel    | local recovery 或重开后正常 server recovery                |
