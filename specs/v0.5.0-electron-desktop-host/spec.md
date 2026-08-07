# Feature Specification: AI Mind Desktop Host

**Version**: `v0.5.0`

**Feature Branch**: `codex/v0.5.0-electron-desktop-host`

**Created**: 2026-08-02

**Status**: Implementation complete; internal-preview operational acceptance pending

**Input**: User description: "将 AI Mind 现有功能接入 Electron，作为长期可维护的桌面端入口；首版采用安全的在线桌面端方案。"

## Decision and Implementation History

Historical entries are retained for traceability. The authoritative final scope and execution order are summarized in **Current Final Scope and Execution State** below.

### Session 2026-08-02

- Q: v0.5.0 内部预览版的 AI Mind Desktop Host 应如何确定其受信线上服务地址？ → A: 内部预览安装包在构建时固定唯一的官方生产 HTTPS 服务地址，用户不能自行修改；开发调试才可显式配置本机地址，且该配置不得进入内部预览安装包。
- Q: 用户在工作页面中主动点击外部链接时，桌面端应如何处理？ → A: 仅将用户主动点击的 `https://` 链接交给系统默认浏览器；`file:`、`javascript:`、`data:` 和自定义协议等一律拒绝，受信 AI Mind 服务继续留在主工作窗口中。
- Q: 在共享设备上，v0.5.0 如何保护桌面会话资料？ → A: 以当前 Windows 用户账户作为桌面资料的隔离边界；v0.5.0 不提供应用内 PIN、自动锁定或退出时清空会话。共用同一 Windows 账户的人员属于该版本不额外处理的信任范围。

### Session 2026-08-03

- Q: v0.5.0 的桌面端和网页端应如何保留会话？ → A: 两端均使用服务端签发的持久会话 cookie；每次正常使用会将有效期续至未来 30 天，连续 30 天未使用才失效。在有效期内，用户关闭并重新打开桌面应用或浏览器后继续使用原会话资料。cookie 失效或用户执行本地资料重置后，服务端按现有会话规则创建或恢复可用会话。
- Q: 用户在流式回答仍在生成时关闭桌面应用后，应如何恢复？ → A: 关闭、崩溃、休眠和重开均不创建取消请求；重开后桌面端不重新挂接仍在活动中的流式订阅，也不伪造完成结果，只按现有网页端的正常 hydration 和已持久化终态读取规则展示结果。
- Q: 当线上 AI Mind 服务持续发布、而用户仍在使用较旧桌面版时，应如何避免功能或安全语义悄然失配？ → A: 发布物与受信服务必须有可识别的兼容性状态；不兼容时显示本地的手动升级引导，不加载不受支持的工作界面，也不在 v0.5.0 自动更新。
- Q: 受信服务不可达、证书校验失败或桌面本地资料损坏时，用户如何安全恢复？ → A: 桌面端提供本地失败页与仅重试固定受信地址的操作，并提供经确认的手动本地资料重置；重置不删除线上会话、记忆或服务端数据。
- Q: 图像下载、复制文本和页面权限请求应遵循什么桌面能力边界？ → A: 仅允许用户主动触发的受信内容下载与文本写入剪贴板；下载必须进入用户可见的保存流程。拒绝剪贴板读取、自动下载及其他未声明权限。
- Q: 远程工作页面如何避免借桌面宿主获得本机能力？ → A: 远程页面运行在与本机能力隔离的受限边界中；不开放通用本机 API，所有远程内容权限默认拒绝，并保持传输与浏览器安全校验开启。
- Q: v0.5.0 的手动发布边界包含什么？ → A: 本版仅发布明确标识为“内部预览、未签名、不得公开分发”的可校验制品，并在手动升级时保持同一 Windows 用户资料；提供已脱敏的支持诊断信息。正式公开代码签名、自动更新、SSO 与自定义协议回调留给后续版本。
- Q: 桌面端发生故障时，已脱敏诊断信息应如何交给支持人员？ → A: 默认不上传；诊断仅在本机生成，由用户主动复制或导出后再交给支持人员。

### Session 2026-08-06

- Q: v0.5.0 新增 macOS 支持的范围是什么？ → A: 仅支持 Apple Silicon 的 macOS arm64，提供未签名内部预览 DMG；不支持 Intel x64 Mac，不制作 universal binary，不接入签名、公证或公开分发。

### Implementation Update 2026-08-04

- 外链澄清的“可稳定辨识的安全 `https://` 交互可交给系统浏览器”前提未通过 Windows/Electron behavior gate：pointer/keyboard `target=_blank`、`window.open` 与合成点击具有相同的 Electron metadata，无法与脚本执行区分。因此 v0.5.0 的 external-opening allowlist 为空，所有外部打开请求均拒绝，且不调用 `shell.openExternal`。

### Implementation Update 2026-08-06

- 未打包 Forge 开发入口通过 Node 22 原生 `process.loadEnvFile()` 读取可选的 `apps/desktop/.env.local`，缺失时仅为开发子进程注入 `http://localhost:3000`。该默认值不进入 `make`、`preview:make` 或 packaged runtime；已有 localhost-only parser 仍拒绝非 loopback 开发 Origin。
- 桌面端原生 About、启动安全对话框、恢复页、诊断导出对话框和图像保存对话框的用户可见文案统一使用简体中文；错误码、协议值、诊断 JSON 字段和 IPC 返回枚举继续保留英文，以维持机器可读契约。
- v0.5.0 的发布平台范围扩展为 Windows x64 与 macOS arm64（Apple Silicon）。macOS 仅提供未签名内部预览 DMG；Intel x64 Mac、universal binary、签名、公证和公开分发仍不在本版范围内。

## Current Final Scope and Execution State

v0.5.0 的最终交付范围是一个在线 Electron host：支持 Windows x64 Squirrel 安装器与 Apple Silicon macOS arm64 DMG，均仅限未签名的内部预览。Intel Mac、universal binary、Developer ID signing、notarization、自动更新、公开分发和本地 AI Runtime 均不在范围内。

执行顺序以最终收口为准：完成基础能力、Windows CI/规格资产、T070 收敛基线、开发入口与中文化 follow-up（T076-T077）、macOS arm64 extension（T078-T085）后，才可进入 T071-T075 的 source commit、既有 server deploy、production verification、平台制品、manual smoke 与 sign-off。任务 ID 只用于追溯，不表示当前执行优先级。

Windows x64 的 SC-001 保留 10 秒首次启动验收目标。macOS arm64 必须通过相同的兼容性、安全拒绝和 fresh/overlay install 验收，但本版未另行定义 macOS 启动时长成功标准。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 从桌面应用使用 AI Mind（Priority: P1）

作为 Windows 用户，我希望安装并打开 AI Mind 桌面应用后，直接进入与官方 AI Mind 服务一致的工作界面，以便不依赖普通浏览器标签页完成现有 AI 能力的使用。

**Why this priority**: 这是本版本的核心价值。若不能稳定从桌面应用进入现有 AI Mind，其他桌面体验没有独立意义。

**Independent Test**: 在已配置的受信服务可访问时，安装并启动桌面应用，完成一次普通聊天并获得流式回答，全程无需打开普通浏览器。

**Acceptance Scenarios**:

1. **Given** 用户已安装受支持的桌面应用且网络可用，**When** 用户从系统入口启动应用，**Then** 应用在独立窗口中加载官方 AI Mind 工作界面，并可开始新对话。
2. **Given** 用户已经进入桌面应用，**When** 用户发送普通聊天请求，**Then** 用户能在桌面窗口中看到与现有线上 AI Mind 一致的请求、流式回答、停止和错误反馈行为。
3. **Given** 用户使用的是已配置的内部预览版本，**When** 应用请求工作界面或功能数据，**Then** 请求只会发送到该版本声明的受信 AI Mind 服务。

---

### User Story 2 - 在桌面端继续使用现有高级能力（Priority: P1）

作为已经使用 AI Mind 的用户，我希望在桌面应用中继续使用当前已发布的图像生成、受控 Agent、会话历史和流式恢复能力，以便桌面端不会成为功能缩水的入口。

**Why this priority**: 本版本的目标是接入既有 Runtime，而不是重新实现一个只支持普通聊天的桌面 Demo。

**Independent Test**: 在桌面应用中分别完成普通聊天、已发布的图像生成入口、一个受控 Agent 入口，以及一次流式回答进行中关闭应用后的恢复检查；该检查必须证明不发送取消请求、不重新挂接活动订阅，只读取已持久化终态。

**Acceptance Scenarios**:

1. **Given** 用户已进入可用桌面应用，**When** 用户触发现有图像生成或受控 Agent 功能，**Then** 应用沿用线上服务的既有权限、进度、错误和结果展示语义。
2. **Given** 一项流式任务仍在生成时用户关闭桌面应用、发生渲染进程异常或设备休眠，**When** 用户重新打开应用并完成现有页面 hydration，**Then** 桌面端不得创建取消请求、不得重新挂接活动订阅或伪造完成结果；仅按网页端既有规则读取已持久化终态。
3. **Given** 用户在桌面应用中查看会话列表，**When** 用户打开已有会话，**Then** 用户只能看到属于当前桌面会话身份的既有会话与记忆结果。

---

### User Story 3 - 保持桌面会话连续性（Priority: P2）

作为桌面用户，我希望关闭并重新打开应用后仍能继续使用同一个桌面会话身份，以便不会因为重启应用而丢失刚才的会话上下文或历史入口。

**Why this priority**: 桌面应用应提供稳定的日常使用体验，同时必须继续遵守现有会话隔离规则。

**Independent Test**: 在同一台受支持的 Windows x64 或 macOS arm64 设备上完成一次对话，正常退出并重新启动应用，然后确认该对话仍可从会话列表访问。

**Acceptance Scenarios**:

1. **Given** 用户已在当前 Windows 或 macOS 用户账户的桌面应用中建立会话，**When** 用户正常退出并重新打开同一应用，**Then** 应用恢复该操作系统用户账户对应的会话身份与可访问历史。
2. **Given** 桌面端保存的会话身份已失效或被服务端拒绝，**When** 用户重新打开应用，**Then** 应用以安全、可理解的方式建立或提示新的可用会话，而不会展示其他用户的数据。

---

### User Story 4 - 在受控安全边界内使用桌面窗口（Priority: P1）

作为用户，我希望桌面应用只展示官方 AI Mind 内容，并拒绝页面发起的外部打开请求，以便网页内容不会获得不必要的电脑权限或在应用内跳转到未知网站。

**Why this priority**: 桌面应用比普通网页更接近用户设备；安全边界是内部预览可控试用及后续正式发布的前提。

**Independent Test**: 尝试让工作界面导航到未受信地址、创建新窗口、请求未声明的设备权限或打开不安全外部链接，确认应用拒绝这些操作。

**Acceptance Scenarios**:

1. **Given** 桌面应用已打开，**When** 页面尝试跳转到非受信 AI Mind 地址，**Then** 当前工作窗口保持在原有受信地址，且不会加载目标页面。
2. **Given** 页面包含外部链接，**When** 用户或脚本尝试通过 `target=_blank`、`window.open`、form target 或合成点击打开它，**Then** 桌面应用拒绝该请求，不创建未知内容窗口或系统浏览器窗口，主工作窗口仍停留在受信 AI Mind 服务中。
3. **Given** 页面或第三方内容尝试请求未声明的设备权限或本地能力，**When** 用户尚未在产品中明确触发对应功能，**Then** 桌面应用拒绝该请求。

---

### User Story 5 - 在服务异常或手动升级后安全恢复入口（Priority: P1）

作为桌面用户，我希望在服务不可达、桌面版本不再兼容或我手动安装新版后，仍能得到明确且安全的恢复路径，以便不会面对空白窗口、错误地绕过安全校验或丢失既有桌面会话资料。

**Why this priority**: 桌面壳会长期留在用户电脑中，线上服务与 Electron 安全补丁却会独立演进；“不做自动更新”仍必须有兼容性和手动升级策略。

**Independent Test**: 模拟网络不可用、证书校验失败和已知不兼容的桌面/服务组合，确认用户在 5 秒内看到本地失败或升级引导；在同一 Windows 或 macOS 用户账户中手动安装新版后，确认已授权会话资料仍可用。

**Acceptance Scenarios**:

1. **Given** 受信服务不可达、证书校验失败或首屏加载超过允许时限，**When** 用户启动或重试桌面应用，**Then** 应用显示自身提供的失败状态，并且重试只访问固定受信地址。
2. **Given** 已安装桌面版本与受信服务的兼容性状态为不支持，**When** 用户启动应用，**Then** 应用不加载不受支持的工作界面，而是显示版本信息和由用户主动触发的手动升级指引。
3. **Given** 用户在同一 Windows 或 macOS 用户账户中手动安装较新桌面版本，**When** 新版本首次启动，**Then** 应用保留原有 Desktop Session Profile，并继续由线上服务判定会话访问权限。
4. **Given** 用户看到桌面失败状态，**When** 用户主动复制或导出支持诊断摘要，**Then** 摘要仅在本机生成，应用不自动向任何服务上传该摘要。

---

### User Story 6 - 安全保存现有图像生成结果（Priority: P1）

作为使用图像生成的用户，我希望在桌面应用中主动保存已展示的结果图片，同时不让页面静默下载任意文件或读取我的剪贴板。

**Why this priority**: 图像下载是当前已发布能力的一部分，而下载、剪贴板和本地权限是网页进入桌面容器后最容易被忽略的能力边界。

**Independent Test**: 对已展示的图像结果执行下载并完成用户可见的保存操作；分别尝试自动下载、非受信来源下载、剪贴板读取和未声明权限请求，确认均被拒绝。

**Acceptance Scenarios**:

1. **Given** 用户在受信 AI Mind 页面中看到当前会话有权访问的图像结果，**When** 用户主动选择下载，**Then** 应用仅下载该受信结果，并进入用户可见的保存流程。
2. **Given** 页面、第三方内容或脚本尝试在没有用户主动操作时发起下载，**When** 桌面端收到该请求，**Then** 桌面端拒绝下载且不写入用户文件系统。
3. **Given** 用户主动使用现有复制文本操作，**When** 页面请求写入文本剪贴板，**Then** 仅允许该写入；页面不得读取剪贴板内容或获得其他设备权限。

### Edge Cases

- 受信 AI Mind 服务不可访问、响应超时或证书校验失败时，应用必须保持安全边界，并向用户显示可理解的重试或稍后再试提示。
- 用户在应用仍运行时再次启动应用，系统不应产生多个互相竞争的工作会话窗口；应将用户带回已有工作窗口或给出一致的启动结果。
- 服务端返回登录态或会话状态异常时，应用不得使用猜测的身份继续访问，也不得泄露已有会话内容。
- 页面尝试通过重定向、弹窗、嵌入页面或不安全协议离开受信范围时，应用必须拒绝或交由明确的安全外部打开策略处理。
- 页面或第三方内容尝试在非用户主动操作下打开外部地址，或尝试使用 `file:`、`javascript:`、`data:`、自定义协议等非 HTTPS 协议时，应用必须拒绝，且不得将该请求交给系统浏览器。
- 用户在流式任务进行中关闭窗口或退出应用时，服务端任务及其恢复语义必须保持与现有网页端一致；桌面端不得创建取消请求、重新挂接活动订阅或伪造完成结果，重开后只读取正常 hydration 可见的已持久化终态。
- v0.5.0 的桌面资料隔离依赖当前 Windows 或 macOS 用户账户；同一操作系统账户的共用人员不会被应用内 PIN、自动锁定或退出清理机制再次区分。
- 已安装桌面版被受信服务判定为不兼容时，应用必须停留在本地兼容性失败状态，显示最低版本和受控内部渠道升级说明；不得在应用内打开升级页面。
- 本地会话资料、cookie 或缓存损坏、不可读或空间不足时，应用必须说明本地恢复失败，并允许用户确认后仅重置本地 Desktop Session Profile；不得据此删除线上会话、记忆或服务端数据。
- 渲染进程崩溃、窗口异常关闭、设备休眠或再次启动应用时，桌面端不得自行向服务端创建取消意图；重新可用后仍遵循既有 stream recovery、幂等和服务端终态规则。
- 非用户主动、非受信工作页面发起的下载，或带有不安全文件名、来源或协议的下载请求，必须被拒绝；不得静默写入用户文件系统。
- 桌面失败状态不得自动将 Desktop Support Diagnostic 发送到受信服务、第三方服务或其他网络端点；只有用户主动复制或导出后，才可自行选择是否交给支持人员。
- `manual_upgrade_required` 若缺少 `minimumDesktopVersion`、该字段不是 strict semver，或其版本不严格高于当前 Desktop Release，必须作为 compatibility contract invalid 处理并进入本地 recovery，不得显示不可信升级提示。
- 同一 recovery 状态下的重复 retry 不得并行创建 attempt；confirmed reset 会立即使当前 attempt 失效并优先于 retry，reset 期间的 second-instance 只聚焦当前 recovery/native safe state。窗口关闭或 renderer crash 不产生 cancel，也不让旧回调恢复 workspace。
- 若 workspace profile 无法初始化，独立 recovery session 仍应只显示 `PROFILE_UNAVAILABLE` 的安全状态；若 recovery session、protocol、白名单资源或本地 Desktop Chrome bootstrap 本身不可用，则以 native safe dialog 显示 `LOCAL_RECOVERY_UNAVAILABLE`，只提供重试或退出且不加载远程页面。重试必须等待完整的固定 Origin 启动流程，退出必须终止应用。Blob URL 在下载开始前已失效、在下载中被中断或用户取消 native save 时均不得写出部分或静默文件。

## Implementation Evidence

**Windows external-opening behavior gate (2026-08-04)**: Electron 43 on Windows reports the same `foreground-tab` disposition and an empty `postBody.data` collection for trusted pointer activation, keyboard activation, `window.open`, and synthetic click. POST form submission is distinguishable only because it carries body data. The first four vectors cannot be reliably separated by the fields available to `setWindowOpenHandler`, so the v0.5.0 external-opening allowlist is empty and no external link is opened by the desktop host.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 系统必须提供可安装、可从受支持操作系统入口启动的 AI Mind 桌面应用；v0.5.0 支持 Windows x64 与 macOS arm64（Apple Silicon），不承诺 macOS Intel x64、universal binary 或其他操作系统。两个平台的已打包应用必须嵌入 AI Mind 图标；Windows Squirrel 的 `Setup.exe` 与 `Update.exe` 必须使用同一 `.ico`，macOS `.app` 必须使用同一品牌 `.icns`。图标构建不得依赖安装时下载的远程资源。
- **FR-002**: 系统必须在桌面应用的独立工作窗口中加载该内部预览版本预先声明的受信 AI Mind 在线服务，并拒绝任意未声明的工作界面来源；内部预览安装包必须在构建时固定唯一的官方生产 HTTPS 服务地址，用户不得自行修改该地址。开发调试可显式配置本机地址，但该配置不得进入内部预览安装包。该 Origin、产品 identity 或 release metadata 的变更必须由当前版本负责人批准，重新构建候选制品，并在同一 canonical spec 工作区同步相关 contract、plan、tasks 和 release evidence。
- **FR-003**: 用户必须能够在桌面应用中完成现有普通聊天流程，包括发送、流式查看、停止和现有错误反馈。
- **FR-004**: 用户必须能够在桌面应用中使用当前已发布的图像生成、受控 Agent、会话历史与流式恢复能力；这些能力的业务规则继续以线上 AI Mind Runtime 为准。
- **FR-005**: 系统必须通过服务端签发的持久会话 cookie，为桌面端和普通网页端提供“连续 30 天未使用才失效”的会话保留期；每次正常使用均将 cookie 有效期续至未来 30 天。在有效期内，用户正常关闭并重新打开应用或浏览器后可继续访问自己仍有权限查看的会话。桌面端以当前 Windows 或 macOS 用户账户作为本地资料隔离边界；本版本不提供应用内 PIN、自动锁定或退出时清空会话。
- **FR-006**: 系统必须保证桌面应用不会因为页面内容而自动授予本地文件、命令执行、设备访问或任意进程控制能力。
- **FR-007**: 系统必须限制工作窗口只在受信 AI Mind 服务范围内导航，并禁止页面自行创建未知工作窗口。
- **FR-008**: Windows/Electron behavior gate 已证明 v0.5.0 没有可稳定辨识的外部打开向量。系统必须拒绝全部外部打开请求，不调用默认系统浏览器；`file:`、`javascript:`、`data:`、自定义协议、`window.open`、form target、`target=_blank`、脚本/合成点击及其他请求均不得打开。主工作窗口必须继续停留在受信 AI Mind 服务中。
- **FR-009**: 当受信服务不可用、网络不可用或安全校验失败时，系统必须展示可理解的失败状态和可用的恢复建议，不得降低安全限制来继续加载内容。
- **FR-010**: 系统必须在应用内提供可辨识的产品版本信息，便于用户、支持人员和发布流程确认所运行的桌面版本。
- **FR-011**: v0.5.0 的桌面安装包必须明确标记为“内部预览、未签名、不得公开分发”，并随制品提供版本和 SHA-256 校验信息；本版本不得将该制品表述为可让操作系统识别发布者的正式公开发行物。公开代码签名与正式分发必须在后续独立版本完成。打包 fuse 必须与随 Electron 发布的启动资源兼容，并以实际可执行文件读取和启动 smoke 验证，不能只验证源配置。
- **FR-012**: 系统必须保持现有服务端密钥、数据库凭据、模型提供方凭据和内部服务凭据不进入桌面安装包、页面公开数据或用户可见日志。
- **FR-013**: 系统必须能判定 Desktop Release 与受信 AI Mind 服务是否兼容。若状态为不兼容，应用不得加载不受支持的工作界面，必须展示本地最低支持版本、内部渠道手动升级说明和当前版本信息；本版本不得自行下载、安装更新或打开升级 URL。
- **FR-014**: 当受信服务不可达、TLS 证书校验失败、首屏加载超时或兼容性检查失败时，系统必须在本地显示失败状态与重试操作。每次启动、重试或重置后的兼容性检查、响应解析和首屏加载共用 5 秒总时限；重试只能访问构建时固定的受信地址，且不得通过忽略证书错误、降级到 HTTP 或放宽导航规则恢复。若 workspace profile、recovery session、包内 recovery 资源或本地 Desktop Chrome bootstrap 本身不能安全初始化，系统必须 fail closed：销毁未初始化的壳窗口，只显示不含原始错误的本地安全状态（recovery 不可用时使用 native safe dialog），只允许完成整个启动流程的重试或终止应用，绝不回退加载远程工作页。
- **FR-015**: 系统必须为当前 Windows 或 macOS 用户账户提供经确认的手动本地资料重置操作。该操作仅清除本地 Desktop Session Profile、cookie、缓存和浏览器本地资料，不删除线上会话、记忆或服务端数据；手动升级同一产品的 Desktop Release 时必须保留该资料。
- **FR-016**: 系统必须只允许当前受信工作页 main frame 发起、Electron `DownloadItem.hasUserGesture()` 为真、无 redirect 且具有安全图像来源/文件名/MIME 的下载，并将其交给用户可见的保存流程；自动下载、非受信来源下载和不安全文件名或协议必须被拒绝。v0.5.0 的受信图像来源仅指现有受信网页将严格 `image-result-ready` 的同源内容路径取回后创建、嵌入 Origin 与 build-time Trusted AI Mind Origin 完全相同的 Blob URL；不直接放行内容路由或任意同源 URL。系统仅允许用户主动触发的文本写入剪贴板，不得向远程页面授予剪贴板读取能力。
- **FR-017**: 所有加载远程内容的桌面工作窗口必须与本机能力隔离，不得向页面提供本机代码执行、通用本机 API、未定义本地能力或跨域特权；任何未来所需的本地能力都必须先定义最小的专用边界。
- **FR-018**: 系统必须默认拒绝远程内容的权限检查与权限请求，并保持浏览器安全校验、TLS 证书校验和安全内容限制开启。受信线上服务的生产响应必须提供与实际资源依赖相符的限制性浏览器内容与权限安全策略。
- **FR-019**: 系统必须将桌面窗口关闭、渲染进程异常、设备休眠和第二次启动与现有服务端 stream recovery、幂等和取消语义对齐；这些事件不得隐式创建取消请求，重开后不得重新挂接活动流式订阅或伪造完成结果，只能按现有网页端的正常 hydration 与已持久化终态规则显示结果。第二次启动时若已有窗口，则必须聚焦该窗口。
- **FR-020**: 系统必须提供可用于支持排障的已脱敏诊断信息，至少包含 Desktop Release、桌面运行环境版本、操作系统与架构、受信 Origin、兼容性状态和安全网络错误码；不得包含聊天正文、图片内容、cookie、Prompt、密钥或内部服务配置。诊断仅在本机生成，并且只能由用户主动复制或导出；系统不得自动上传诊断或发送遥测数据。
- **FR-021**: 系统必须遵循 Windows 系统代理与正常 TLS 信任链；不得提供绕过、接受或忽略证书错误的用户入口或回退策略。
- **FR-022**: v0.5.0 内部预览 Desktop Release 必须具有稳定的产品身份与用户资料路径，并随制品提供可校验的版本与 SHA-256 完整性信息，以支持用户手动升级与问题回退定位；代码签名发布者信息不属于本版本承诺。
- **FR-023**: compatibility API 和 document security headers 必须先通过既有 server deployment 机制上线，并在固定生产 Origin 验证候选 Desktop Release 的 strict response、无 cookie 副作用和安全 headers；production verifier 必须精确接受 `style-src 'self' 'unsafe-inline'`，并拒绝 `style-src` 的 nonce/hash 与任意 `style-src-attr`。document CSP 必须继续严格限制脚本，而 Web document 与包内 Electron local document 的全部 CSS 必须通过上述指令生效。该 CSS 兼容例外不得扩展到 `script-src`、API 或静态资源响应，也不得新增远程样式来源、改变 Origin、权限、资源白名单或导航策略。验证通过后才可分发对应内部预览制品。候选的版本负责人、server deploy operator 和内部预览分发负责人必须在不含用户资料的 evidence record 中共同关联同一 commit、installer、manifest、SHA-256 与内部渠道说明。若 server 必须回退到不具备这些能力的版本，必须先暂停对应内部预览分发，客户端保持 fail closed。
- **FR-024**: 本地 recovery 页面必须运行在与 workspace persistent profile 分离的非持久 Electron session 中，只加载包内白名单资源，不携带线上 cookie、cache、Service Worker 或工作页 permission state。
- **FR-025**: v0.5.0 必须为 Windows x64 生成 Squirrel 安装包，为 macOS arm64 生成 DMG 安装包；每个制品必须带有唯一的平台/架构标识、版本、SHA-256 和“内部预览、未签名、不得公开分发”说明。macOS 首次启动可能被 Gatekeeper 阻止，配套验收说明必须记录受控的人工打开步骤。
- **FR-026**: `/instant-mind` 在小于 `lg` 断点时必须让移动会话栏相对页面外层左右通栏，聊天标题、消息和输入区仍保持既有 `53.5rem` 内容列宽度；在 `lg` 及以上断点保持桌面会话侧栏布局。该网页布局修复不得修改 Electron 原生“关于”菜单。
- **FR-027**: Desktop 必须在 Windows x64 与 macOS arm64 使用亮色单行桌面顶栏；AI Mind 标识、既有“查看”和“帮助”菜单与平台原生窗口控制必须在同一视觉行内，且不得显示独立的 Windows application menu 行。Windows 保留右侧原生最小化、最大化和关闭按钮；macOS 保留左侧原生 traffic lights。菜单继续由 main process 构造和显示，remote workspace 不得获得菜单 IPC、preload 或其他本机能力。
- **FR-028**: 包内 Desktop Chrome 与 recovery 必须在严格 local CSP 下加载其实际构建产物和外部样式；`style-src` 统一为 `'self' 'unsafe-inline'`，以支持本地运行时 CSS，但 `script-src` 保持 `'self'` 且不得允许 `unsafe-eval`、内联脚本、远程资源或白名单外路径。任一未白名单、未知、含 query/hash 或路径遍历的本地资源必须继续拒绝。
- **FR-029**: Desktop 在 compatibility 通过后必须固定进入受信 Origin 的 `/instant-mind` 工作区，而不是网站根页面；该路径不是用户可编辑配置，不改变 Origin、cookie、权限、IPC 或导航 deny-by-default 策略。

### Key Entities _(include if feature involves data)_

- **Desktop Release**: 一份面向特定操作系统和架构的 AI Mind 桌面内部预览发行物，包含产品版本、受信服务配置和 SHA-256 校验信息；v0.5.0 不包含代码签名发布者保证。
- **Trusted AI Mind Origin**: 该桌面发行物被允许在主工作窗口中加载的官方线上服务地址范围。v0.5.0 内部预览安装包仅包含构建时确定的唯一官方生产 HTTPS 地址，用户不可编辑；开发调试的本机地址配置不属于内部预览发行物。
- **Desktop Session Profile**: 与当前 Windows 用户账户下的一台桌面安装关联的持久会话资料，用于保存由服务端签发、连续 30 天未使用才失效的会话 cookie 及其线上服务已支持的会话边界，不包含服务端密钥。该资料不跨 Windows 用户账户共享，v0.5.0 不额外提供应用内 PIN、自动锁定或退出清理。
- **External Navigation Request**: 用户或页面请求离开主工作窗口的地址。Windows/Electron behavior gate 已证明 v0.5.0 没有可稳定辨识的安全外部打开交互，因此所有这类请求都被拒绝，系统浏览器不会被调用。
- **Desktop Compatibility State**: 由 Desktop Release 与受信服务共同确定的可用、需手动升级或不可用状态；它决定主工作界面能否加载，不包含用户会话或服务端密钥。
- **Local Recovery Action**: 用户明确确认的本地资料重置操作，只影响当前 Windows 用户账户下的 Desktop Session Profile，不删除线上服务的数据。
- **Desktop Download Request**: 由受信工作页面 main frame 发起、且 Electron 原生判定存在用户手势的结果保存请求；只有满足单一受信 URL chain、来源、协议、文件名、MIME 和用户可见保存流程规则时才可执行。
- **Desktop Support Diagnostic**: 用于支持排障的最小公开诊断摘要，仅含版本、平台、兼容性和安全网络状态，不含用户内容、身份凭据或内部配置。该摘要仅在本机生成，并由用户主动复制或导出，不自动上传。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 在受支持的 Windows x64 设备上，以未注入限速或故障的真实受信 HTTPS 网络路径进行发布验收时，从桌面进程接受首次启动请求并创建 `attemptId` 开始计时，到 fixed Trusted AI Mind Origin 的工作窗口可见且现有聊天输入可交互为止不超过 10 秒。验收记录必须包含 Windows 版本、Desktop Release、服务版本/compatibility state 与实测耗时。
- **SC-002**: 发布验收中，普通聊天、图像生成、受控 Agent、会话打开和流式恢复五类既有核心场景均可在桌面应用中完成，无需打开普通浏览器。
- **SC-003**: 发布验收中，连续 30 天未使用前关闭并重新打开桌面应用或普通浏览器后，100% 的已授权会话恢复检查均不会显示其他会话身份的数据；每次正常使用都会将 cookie 的到期时间续至未来 30 天。
- **SC-004**: 自动化安全验收中，所有针对未受信导航、新窗口创建、未声明设备权限和不安全外部协议的测试均被拒绝或按安全策略处理。
- **SC-005**: 从一次启动、重试或 reset 后 attempt 开始，当服务不可用、网络断开、TLS 校验失败、compatibility schema 失败或首屏加载超时时，用户可在同一个 5 秒总时限内看到桌面端自身提供的明确不可用状态，而不是空白窗口、无限加载或绕过安全校验后的页面。
- **SC-006**: 发布验收中，兼容、需手动升级和服务不可达三种 Desktop Compatibility State 均有可识别且可操作的界面结果；不兼容状态不会加载工作界面或放宽安全限制。
- **SC-007**: 发布验收中，在同一 Windows 或 macOS 用户账户中手动安装新版 Desktop Release 后，100% 的会话连续性检查均保留原有本地资料；执行本地资料重置后，线上会话和记忆数据不被该操作删除。
- **SC-008**: 自动化安全验收中，远程工作页面无法获得本机代码执行、通用本机 API、剪贴板读取、未声明设备权限或自动下载能力；所有此类请求均被拒绝。
- **SC-009**: 发布验收中，用户可从当前会话的受信图像结果完成一次用户可见的保存操作；自动下载、非受信下载和不安全协议下载的测试全部被拒绝。
- **SC-010**: 支持诊断验收中，用户主动导出的 Desktop Support Diagnostic 包含规定的平台与版本字段，且扫描结果不包含聊天正文、cookie、Prompt、密钥或内部服务配置；失败、复制和导出流程均不会自动发起诊断上传请求。
- **SC-011**: 内部预览验收中，100% 的分发安装包和配套发布说明均显著标明“内部预览、未签名、不得公开分发”，并提供与实际安装包一致的 SHA-256 校验值。
- **SC-012**: 在受支持的 Windows x64 与 macOS arm64 主机上，候选安装包均可完成 fresh install、启动兼容性检查、进入工作区或 recovery，并通过同一套核心安全拒绝测试；Intel x64 Mac 不属于验收样本。
- **SC-013**: 每个候选必须分别提供 `win32-x64` 与 `darwin-arm64` 的平台制品、manifest 和 SHA-256，且 manifest 平台值、实际文件架构和 fuse/package 审计结果完全一致；不得生成或分发 `darwin-x64` 或 universal 制品。

### Acceptance Evaluation Set

- v0.5.0 的“受支持 Windows x64 与 macOS arm64 设备”指运行锁定 Electron 主版本仍支持的对应主机；每次候选验收必须记录实际操作系统 release/build、架构和 Desktop Release。本版不以未记录设备上的延迟结果外推为跨硬件性能承诺。
- SC-001 的样本是每个候选至少一次 fresh install + fresh desktop profile 的正常启动；计时只覆盖真实固定 HTTPS Origin，不能注入限速、故障、TLS bypass 或 Origin override。
- SC-003 的“100%”指每个候选必须全部通过的固定样本集：桌面新建会话后的正常重开、桌面既有有效会话的正常重开、普通网页端既有有效会话的一次正常 session-bound request，以及服务端拒绝或过期会话后不泄露其他身份资料。每个正常 session-bound request 都要断言到期时间续至未来 30 天。
- SC-007 的“100%”指每个候选必须全部通过的固定样本集：同一操作系统用户下 fresh install、same-product overlay install、确认 reset 和 reset 后重新进入兼容性检查。前两项保留 profile；后两项不删除 server data。
- SC-011 的“分发安装包和配套发布说明”固定包含同一 commit 的 installer、`desktop-release.json`、SHA-256 文件、受控内部渠道说明及安装后 native About 标识；任一项缺失、版本或 hash 不匹配即为候选失败。

## Assumptions

- v0.5.0 是需要联网的桌面入口；现有线上 AI Mind 服务继续负责聊天、受控任务、增量回答、持久化、外部能力与模型调用。
- 首版内部预览支持 Windows x64 与 macOS arm64；macOS Intel x64、universal binary、Linux、离线运行和本地模型不属于本版本交付承诺。
- 现有线上服务必须将会话 cookie 设置为连续 30 天未使用才失效的持久 cookie，且桌面端与普通网页端在每次正常使用时采用相同的续期规则；服务端仍然是会话授权与数据隔离的最终事实源。
- 桌面应用只需保存运行所必需的本地会话资料与常规应用资料；服务端密钥和数据库凭据不属于桌面数据。
- 当前 Windows 或 macOS 用户账户是桌面资料的隔离边界；共用同一操作系统账户的人员属于同一信任范围。本版本不新增应用内 PIN、自动锁定或退出时清空会话。
- 本版本不承诺自动更新。自动更新、分阶段发布和其他系统安装包策略需要在后续版本连同签名与更新源一并规划。
- 受信线上服务可以提供稳定、可版本化的兼容性状态，供 Desktop Release 在加载工作界面前判断；具体传输方式属于 Technical Plan，不向页面公开服务端凭据。
- 内部测试用户仅通过受控的内部发布渠道主动获得并安装新 Desktop Release；手动升级和回退的可定位性依赖稳定产品身份、版本信息与 SHA-256 校验信息，而不是应用内自动更新或代码签名。
- Windows/macOS 系统代理与正常 TLS 信任链是联网基础；企业代理、自定义根证书或网络限制导致的失败按安全失败处理，不提供跳过证书校验的回退。
- v0.5.0 不收集或自动上传桌面端故障遥测；支持人员只处理用户主动交付的 Desktop Support Diagnostic。
- 开发调试可显式配置本机服务地址，但内部预览安装包不提供切换官方环境、填写自建服务地址或修改受信地址的入口。
- v0.5.0 不维护外部链接域名白名单；外部打开策略只允许用户主动触发的 `https://` 链接，其他协议或自动打开请求一律拒绝。

## Non-goals

- 不在 v0.5.0 将完整 AI Mind 服务端、数据服务、外部能力服务或运行环境打包到用户电脑。
- 不在 v0.5.0 提供离线聊天、离线 Agent、本地模型或独立本地数据 Runtime。
- 不在 v0.5.0 新建账号体系、改变现有线上会话授权模型或将桌面端变成绕过服务端的管理入口。
- 不在 v0.5.0 向工作页面开放通用本地文件系统、命令执行、进程控制或任意设备权限。
- 不在 v0.5.0 承诺 macOS Intel x64、universal binary、Linux 发行、应用内自动更新、跨设备同步配置或桌面专属功能的大规模重设计。
- 不在 v0.5.0 支持用户填写任意服务地址、自建服务接入或内部预览安装包内的官方环境切换。
- 不在 v0.5.0 提供应用内 PIN、自动锁定、退出时清空会话或面向共用同一 Windows 账户人员的额外桌面资料隔离。
- 不在 v0.5.0 支持 SSO、OAuth、第三方登录跳转、自定义协议回调、浏览器扩展或网页内嵌外部身份提供方；若线上身份体系未来引入这些流程，必须作为新的桌面安全边界版本规划。
- 不在 v0.5.0 提供通用文件上传/选择、任意文件下载、桌面通知、摄像头、麦克风、定位、蓝牙、USB、串口或屏幕捕获能力；当前受信图像结果的用户主动保存是唯一明确允许的本地文件输出。
- 不在 v0.5.0 提供自定义代理、接受不受信任证书、忽略 TLS 错误或调低浏览器安全限制的用户入口。
- 不在 v0.5.0 采购代码签名证书、接入托管签名服务，或将内部预览制品作为公开正式发行物分发。
- 不在 v0.5.0 自动采集、自动上传或后台发送 Desktop Support Diagnostic、故障遥测或用户行为数据。
