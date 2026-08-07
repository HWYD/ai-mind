# Contract: Desktop Host Security Policy

**Feature**: v0.5.0 Electron Desktop Host  
**Status**: Planned v1 host policy

## Trust Zones

| Zone        | Content                                                                          | Native access                                    | Navigation                  |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------- |
| `workspace` | exact build-time trusted AI Mind Origin                                          | none: no preload, no IPC, no Node                | exact Origin only           |
| `recovery`  | packaged `ai-mind-desktop://local` static assets in a dedicated memory session   | four narrow recovery commands only               | own fixed local routes only |
| `chrome`    | packaged `ai-mind-desktop://local/chrome/index.html` in the local memory session | request only the `view` or `help` native submenu | exact Chrome URL only       |
| `external`  | arbitrary external site                                                          | denied; no system-browser handoff in v0.5.0      | not loaded in Electron      |

`ai-mind-desktop://local` 不是 OS-registerable callback protocol，不接收外部进程调用，也不允许 remote URL、`file:` 或任意路径映射。它必须在 `app.ready` 前且仅一次通过 `protocol.registerSchemesAsPrivileged` 注册最小 `standard`、`secure` 特权；不得设置 `bypassCSP`、`allowServiceWorkers`、`supportFetchAPI` 或其他扩展能力。protocol handler 只绑定到 recovery memory session，并只服务 ASAR 内白名单静态资源；query/hash、路径遍历、未知 host/path 一律失败。

## Required WebPreferences

所有 renderer 显式设置：

```text
nodeIntegration=false
contextIsolation=true
sandbox=true
webSecurity=true
allowRunningInsecureContent=false
webviewTag=false
experimentalFeatures=false
```

workspace window 不设置 preload。recovery window 的 preload 只能以 `contextBridge` 暴露下表中的具名函数，不得暴露 `ipcRenderer`、send/invoke 通道名、Node module 或泛化对象。

## Desktop Chrome Bridge

Desktop Chrome is a packaged local renderer behind the platform title bar; it is not part of the remote workspace. Windows uses `titleBarOverlay` for right-side native controls and macOS retains left-side native traffic lights. Its preload exposes only one `openMenu(menu, position)` method. Main process validation requires the current Chrome `WebContents` and exact `ai-mind-desktop://local/chrome/index.html` URL, accepts only the `view` and `help` enum values, and bounds `{ x, y }` to the title-bar area. A valid request may only call main-owned `Menu.popup()` for the existing native submenu. Chrome and recovery HTML, JavaScript and external stylesheet paths are an exact Forge-output allowlist. Their local CSP uses `style-src 'self' 'unsafe-inline'` for runtime CSS compatibility, while `script-src 'self'` continues to forbid inline script and `unsafe-eval`; no remote resource or unlisted path is allowed. The workspace has no Chrome preload, IPC channel, or native capability and always opens at the build-owned `/instant-mind` path.

## Recovery Bridge

| Method                                     | Input                | Main-process validation                          | Effect                                            |
| ------------------------------------------ | -------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `retry()`                                  | none                 | sender is current recovery local page            | re-run fixed compatibility check                  |
| `confirmResetProfile({ confirmed: true })` | literal confirmation | sender local + state recovery + explicit boolean | destroy workspace, targeted `clearData`, re-check |
| `copyDiagnostic()`                         | none                 | sender local + diagnostic allowlist              | write generated plain text only                   |
| `exportDiagnostic()`                       | none                 | sender local + diagnostic allowlist              | native save dialog, `.txt` only                   |

所有 handler 都拒绝错误 sender、错误 window kind、未知字段、无效状态和重复并发操作，并返回安全 enum，不返回文件路径、raw error、cookie 或内部对象。`manual_upgrade_required` 仅展示当前版本、最低支持版本和“从 GitHub Pre-release 获取较新 Unsigned Experimental Preview”的说明；v0.5.0 没有 recovery 升级 URL 或对应 IPC。

## Bootstrap Failure Handling

- workspace persistent profile 无法创建或读取时，主进程只能在独立 recovery memory session 中显示 `PROFILE_UNAVAILABLE`；不得尝试 default session、任意临时业务 profile 或远程 workspace fallback。
- recovery memory session、`ai-mind-desktop` protocol、其 ASAR 白名单资源或本地 Desktop Chrome bootstrap 无法安全初始化时，主进程必须销毁未初始化的 shell 并显示 `LOCAL_RECOVERY_UNAVAILABLE` 的 native safe dialog。该 dialog 不显示 raw error、路径、证书或配置；它等待用户选择，`retry` 重新执行完整的固定启动流程，`exit` 终止应用，二者都不加载 remote workspace。
- recovery 中重复 retry 返回 `already_in_progress`，不会并发创建 compatibility attempt。confirmed reset 优先：使当前 attempt 失效、停止 workspace 后清理，再在完成或失败后创建下一 attempt。reset 期间的 second-instance 只能聚焦当前 recovery/native safe state。

## Navigation and External Opening

### Windows Behavior Gate Outcome (2026-08-04)

On Windows with Electron 43, trusted pointer activation, keyboard activation, `window.open`, and synthetic click all produce `foreground-tab` with an empty `postBody.data` collection. Because those fields do not reliably distinguish a genuine user external-link activation from script execution, the allowed external-opening set is empty. `setWindowOpenHandler` always returns `deny`, and the desktop host does not call `shell.openExternal`. A POST form target has body data but remains denied.

| Event/target                                                                                  | Required handling                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| workspace main-frame same exact Origin                                                        | allow                                                                     |
| workspace off-origin navigation, redirect or frame navigation                                 | prevent and keep/return local safe state                                  |
| popup/window creation                                                                         | `setWindowOpenHandler` 始终 `deny`；never create embedded external window |
| trusted main-frame `target=_blank` HTTPS 外链                                                 | deny; Windows behavior gate has no stable user-activation discriminator   |
| trusted Origin link                                                                           | allow only as ordinary workspace navigation                               |
| `window.open`、form target、synthetic/automatic/script-only external open、无法稳定验证的事件 | deny                                                                      |
| `http:`, `file:`, `data:`, `javascript:`, custom scheme, malformed URL                        | deny                                                                      |

v0.5.0 的 policy module 不导入或调用 `shell.openExternal`。Windows behavior gate 已使用真实 pointer/keyboard click、`window.open`、synthetic click 与 form target 收集 Electron 的 `url`、`disposition`、`postBody`；不能可靠区分的向量保持拒绝，不能以“时间很近”当作用户手势证明。

## Permission Policy

| Permission                                             | Policy                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `clipboard-sanitized-write`                            | allow only trusted workspace main frame; Chromium user activation remains required |
| `clipboard-read`, deprecated sync read                 | deny                                                                               |
| `fileSystem`                                           | deny                                                                               |
| camera/microphone/media/DRM                            | deny                                                                               |
| notification, geolocation, idle, pointer/keyboard lock | deny                                                                               |
| USB/HID/serial/Bluetooth/MIDI                          | deny and do not install a selecting handler                                        |
| display capture/window management                      | deny; no display media handler                                                     |
| storage access, openExternal, unknown                  | deny                                                                               |

Both Electron `setPermissionCheckHandler` and `setPermissionRequestHandler` enforce this table. The web response `Permissions-Policy` independently disables the same unused browser features.

## Download Policy

`will-download` is deny-by-default. A request is approved only when all conditions hold:

1. event originates from current workspace main frame and that frame is at trusted Origin;
2. `DownloadItem.hasUserGesture()` is `true`;
3. `getURLChain()` has exactly one Blob URL whose embedded Origin equals the trusted Origin. 该 Blob 只能是现有 ImageResult UI 从 strict `image-result-ready` 的 `/api/chat/runs/<runId>/image` 内容路径读取后创建的 URL；content route、本身任意同源 URL、redirects 以及 external/file/custom URLs 均拒绝；
4. filename is normalized safe basename, and MIME/extension are an allowed image pair (`png`, `jpg/jpeg`, `webp`);
5. policy invokes `setSaveDialogOptions`; no application-chosen save path exists.

任何条件失败均 `event.preventDefault()`，并且不写文件。用户取消 native dialog 也不写文件。Desktop 不开放 upload、directory picker 或 arbitrary download。

Blob URL 在 save dialog 确认前失效，或下载在此期间中断时，Desktop 必须取消而不创建部分文件；不得改用原 content route、网络重试或静默保存作为 fallback。

## Certificate, Proxy and Network Rules

- 使用 Electron/Chromium 默认 TLS 验证和 Windows 代理/PAC；不调用 `setCertificateVerifyProc`，不接受 `certificate-error`，不使用 ignore-certificate switch。
- 兼容性检查使用 profile `ses.fetch()`；不使用 Node HTTP stack、代理 override 或 custom protocol request。
- TLS/代理/网络异常被归一化为安全错误码；不会降低安全开关、切到 HTTP 或加载替代 URL。

## Session Persistence Boundary

- 线上服务向桌面端和普通网页端签发相同的持久会话 cookie：`HttpOnly`、`SameSite=Lax`、生产环境 `Secure`、`Max-Age=2592000`（30 天）和等价 `Expires`。每个成功解析既有会话的正常会话请求都必须重写该 cookie，使其有效期滚动续至未来 30 天。
- `GET /api/desktop/compatibility` 必须保持 `credentials: 'omit'`、无身份且无副作用；它不得读取、写入或续期会话 cookie。
- Electron persistent profile 只负责安全保存 Chromium 已接收的 cookie；主进程既不读取、不构造，也不修改 cookie 值或有效期。
- workspace window 与 compatibility client 使用 persistent profile；recovery window 使用独立、不带 `persist:` 前缀的 memory session，不携带线上 cookie、cache、Service Worker 或工作页 permission state。
- cookie 失效或用户确认重置本地资料后，服务端继续按既有会话规则创建或恢复可用会话；本地重置不调用删除线上会话、记忆或其他服务端数据的 API。

## Packaging Fuses

v0.5.0 public-beta artifact 必须启用 `EnableCookieEncryption`、`EnableEmbeddedAsarIntegrityValidation` 和 `OnlyLoadAppFromAsar`，并禁用 `RunAsNode`、`EnableNodeOptionsEnvironmentVariable` 与 `EnableNodeCliInspectArguments`。产物验证脚本读取实际 fuse 状态，并枚举每个 `app.asar` 的真实条目以拒绝 `.env`、私钥和签名凭据，而不只检查配置源文件；这些安全要求不因制品未签名而降低。
