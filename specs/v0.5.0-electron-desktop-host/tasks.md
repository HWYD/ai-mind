# Tasks: AI Mind Desktop Host

**Input**: `specs/v0.5.0-electron-desktop-host/` 中的 `plan.md`、`spec.md`、`research.md`、`data-model.md`、`quickstart.md` 与 `contracts/`  
**Branch**: `codex/v0.5.0-electron-desktop-host`  
**Tests**: 本版本的 spec 与 plan 明确要求 contract、安全、主进程集成、Windows 打包与回归验证，因此测试任务必须先于对应实现任务。  
**Organization**: 按用户故事分阶段；所有 P1 故事按安全启动依赖排序，而非按故事编号排序。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行，且不依赖同阶段未完成任务、不会修改同一文件。
- **[USn]**：任务所服务的用户故事；Setup、Foundational 与收口任务不带故事标签。
- 每个任务均列出应修改、创建或作为验证入口的准确路径。

## Learning Pause Points

执行本清单时，在下列暂停点停止实现，让版本负责人先查看代码、测试和当前边界，再决定是否继续。暂停点不改变任务依赖，也不替代测试或验收；未满足“继续条件”时不得进入下一段任务。

| Pause ID | 触发位置                            | 类型 | 查看重点                                                                          | 继续条件                                                                   |
| -------- | ----------------------------------- | ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| PP-00    | T001 开始前                         | 建议 | spec/plan/tasks 如何映射到目录、入口和阶段依赖                                    | 能说清本版在线宿主边界与 Non-goals                                         |
| PP-01    | T006 完成后                         | 建议 | Electron/Forge、pnpm/Turbo、测试车道和 build script                               | desktop workspace 可被 pnpm/Turbo 识别，且 clean install 结论已记录        |
| PP-02    | T012 完成后                         | 必须 | compatibility API strict DTO、CSP、proxy 分路由与无 cookie 副作用                 | Web 契约测试通过，且能说明 document/API/static 三类 header 语义            |
| PP-03    | T020 完成后                         | 必须 | 固定 Origin、profile/recovery session、local protocol、fuse 和 artifact allowlist | Desktop 基础安全测试通过，且尚未向远程页面提供 bridge                      |
| PP-04    | T027 完成后                         | 必须 | Windows 外链 behavior gate 证据如何决定 navigation/popup/permission policy        | 允许集合已由实际行为证据约束；无法稳定区分的向量保持 deny                  |
| PP-05    | T038 完成后                         | 必须 | attemptId、5 秒总 deadline、stale callback、recovery IPC、diagnostic 和 reset     | compatible 才能进入 workspace，所有失败路径均 fail closed                  |
| PP-06    | T043 完成后                         | 必须 | single-instance、首屏计时、普通聊天、原生 About/版本入口和 Safe MVP smoke         | Safe MVP 验收通过，且 desktop 仍未复制 AI Runtime                          |
| PP-07    | T047 完成后                         | 建议 | 图像、Agent、会话列表和 StreamRun 终态恢复如何继续由 webapp 负责                  | close/crash/suspend/reopen 不发送 cancel、不重新订阅、不伪造终态           |
| PP-08    | T052 完成后                         | 建议 | DownloadItem 用户手势、来源/URL chain、MIME 和系统保存对话框                      | 只有受信图像主动保存可写入文件，其余下载与 clipboard read 均拒绝           |
| PP-09    | T058 完成后                         | 建议 | 服务端滑动 cookie、Chromium profile、覆盖安装和本地 reset 数据边界                | 会话授权仍由服务端负责，reset 不删除 server data                           |
| PP-10    | T061 完成后、任何 `preview:make` 前 | 必须 | CI 与生产验证、server-first 顺序、候选 Desktop version header                     | 生产 compatibility API/CSP 验证通过；未通过不得生成或分发 preview artifact |
| PP-11    | T069 完成后                         | 必须 | acceptance evidence、spec drift、阶段审计和 release closing                       | 所有失败项已记录，才允许内部预览 release closing                           |

暂停期间建议按“代码入口 → 契约边界 → 测试意图 → 下一阶段依赖”顺序复习。版本负责人确认继续后，再执行对应的下一段任务。

## Path Conventions

- Electron 宿主：`apps/desktop/`
- 线上 web 配套：`apps/webapp/`
- 共享 CI / workspace 治理：根目录、`scripts/validate/`、`.github/workflows/`
- 生产验证与公开文档：`deploy/`、`docs/`

---

## Phase 1: Setup（共享工程骨架）

**Purpose**: 建立可被 Turborepo、pnpm 与 Windows 构建识别的最小 desktop workspace；不接入 AI Runtime 或本机业务能力。

**Learning Pause PP-00（建议）**：开始 T001 前，先复习 spec、plan、tasks 的目录映射、在线宿主边界和 Non-goals。

- [x] T001 创建 `apps/desktop/package.json`、`apps/desktop/tsconfig.json`、`apps/desktop/forge.config.ts` 与 `apps/desktop/src/` 骨架，使用 `@ai-mind/desktop` workspace、Forge Webpack、Squirrel.Windows x64 与稳定 product identity。
- [x] T002 在 `apps/desktop/package.json`、`pnpm-workspace.yaml` 和 `pnpm-lock.yaml` 锁定实现当日仍受支持的 Electron、Electron Forge、`@electron/fuses`、`electron-squirrel-startup`、Playwright 依赖；在 Windows clean install 记录最小必要 `allowBuilds`，不得放开通配安装脚本。
- [x] T003 在根 `package.json`、`turbo.json` 和 `scripts/validate/validate-test-lanes.mjs` 增加 desktop 的 `lint`、`typecheck`、`test:stable`、`test:integration`、`make:windows`、`preview:make`、`verify:artifact` 任务图与测试目录治理。
- [x] T004 [P] 创建 `apps/desktop/vitest.config.ts`、`apps/desktop/vitest.setup.ts`、`apps/desktop/playwright.config.ts` 与 `apps/desktop/tests/{unit,integration,packaged}/`，限定 unit 与 development Electron integration 的测试边界。
- [x] T005 [P] 创建 `apps/desktop/scripts/verify-pnpm-builds.mjs`，在 Windows 记录 Electron/Forge binary 下载和最小 `allowBuilds` 结果，并将结论同步到 `specs/v0.5.0-electron-desktop-host/research.md` 的 Implementation Verification Unknowns。
- [x] T006 在 `apps/desktop/.gitignore` 与 `apps/desktop/forge.config.ts` 排除开发缓存、测试输出、未打包运行产物、私密 profile 与签名文件，确保它们不进入 artifact 或仓库。

**Checkpoint**: `@ai-mind/desktop` 可被 pnpm/Turbo 识别，且 Windows 依赖安装权限有可复现的最小记录。

**Learning Pause PP-01（建议）**：查看工程骨架、脚本和测试车道。

---

## Phase 2: Foundational（所有故事的安全前置条件）

**Purpose**: 先稳定线上 compatibility/header 契约、桌面 build config、状态模型和本地 protocol；在此阶段完成前不得加载远程工作页。

**⚠️ CRITICAL**: 以下任务阻塞全部用户故事。

- [x] T007 [P] 为 strict compatibility policy 编写失败优先的单元测试，覆盖 semver、未知版本、无用户身份及 fail-closed 分支：`apps/webapp/tests/lib/desktop/compatibility-policy.test.ts`。
- [x] T008 实现无状态的版本比较 policy：`apps/webapp/lib/desktop/compatibility-policy.ts`，不得读取 cookie、数据库、Agent Runtime 或环境可写 Origin。
- [x] T009 为 `GET /api/desktop/compatibility` 编写 contract/route 测试，覆盖 Accept、Desktop version header、strict v1 body、`Cache-Control: no-store` 与无 `Set-Cookie`：`apps/webapp/tests/app/api/desktop/compatibility/route.test.ts`。
- [x] T010 实现 `apps/webapp/app/api/desktop/compatibility/route.ts`，只接入 `apps/webapp/lib/desktop/compatibility-policy.ts`，按 `contracts/desktop-compatibility-api.md` 输出 strict JSON，不返回 Origin、升级 URL、cookie、token 或 capability。
- [x] T011 [P] 建立现有页面资源 inventory 与 header 回归断言：`apps/webapp/tests/app/browser-security-headers.test.ts`，覆盖 `/`、`/instant-mind`、`/api/desktop/compatibility`、Next static/image 与 prefetch 的不同 header 语义，以及初始的 `style-src-attr` 元素内联样式兼容边界。该 CSS 策略已由 T092-T094 superseded。
- [x] T012 实现 `apps/webapp/lib/security/browser-security-headers.ts` 与 `apps/webapp/proxy.ts`，仅对 document 请求发 nonce CSP；显式排除 API、`/_next/static`、`/_next/image`、favicon 和 prefetch。`script-src` 禁止 `unsafe-inline`/`unsafe-eval` 与宽泛 source；初始 CSS 兼容范围已由 T092-T094 superseded 为 Web document `style-src 'unsafe-inline'`，其余路由边界保持不变。
- **Learning Pause PP-02（必须）**：T012 完成后，复习 compatibility API、strict DTO、CSP、proxy 分路由和无 cookie 副作用，再进入 Desktop 基础安全任务。
- [x] T013 [P] 为 packaged/development Origin、产品 identity、版本、fuse 配置与无升级 URL 约束编写单元测试：`apps/desktop/tests/unit/build-config.test.ts`、`apps/desktop/tests/unit/fuses.test.ts`。
- [x] T014 实现 `apps/desktop/src/main/build-config.ts` 与 `apps/desktop/forge.config.ts` 的 build-time config/fuse 校验：production 固定 `https://ai.hwyblog.cloud`，仅 `app.isPackaged === false` 可用显式 localhost，且启用/禁用的 fuse 与 `contracts/desktop-host-policy.md` 一致。
- [x] T015 [P] 为 persistent workspace profile、非持久 recovery session、定向 reset 数据范围和 host attempt 状态写单元测试：`apps/desktop/tests/unit/session-profile.test.ts`、`apps/desktop/tests/unit/host-state.test.ts`。
- [x] T016 实现 `apps/desktop/src/main/session-profile.ts`、`apps/desktop/src/main/host-state.ts`，创建 `persist:ai-mind-desktop` 与独立 recovery memory session，并落实 `attemptId`、`deadlineAt`、旧异步回调失效规则。
- [x] T017 [P] 为 scheme 注册时机、ASAR 白名单、拒绝 query/hash/路径遍历及 recovery CSP 编写测试：`apps/desktop/tests/unit/local-protocol.test.ts`。
- [x] T018 实现 `apps/desktop/src/main/local-protocol.ts`，在 `app.ready` 前仅注册最小 privileged scheme，并把 handler 绑定到 recovery session；不得启用 `bypassCSP`、Service Worker、fetch 或 OS 协议关联。
- [x] T019 为 artifact manifest 的 source commit/版本字段、SHA-256、内部预览/未签名标识与实际 fuse 检查编写测试：`apps/desktop/tests/unit/release-artifact.test.ts`。
- [x] T020 实现 `apps/desktop/scripts/write-release-manifest.mjs` 和 `apps/desktop/scripts/verify-release-artifact.mjs`，生成/验证 source commit、`desktop-release.json`、SHA-256 与实际 package fuse，禁止包含下载 URL、secret、签名凭据或 dev Origin。

**Checkpoint**: server 兼容契约、document CSP、desktop build config、profile 状态与本地 protocol 均有先行测试和最小实现；尚未向远程页面提供任何 bridge。

**Learning Pause PP-03（必须）**：查看 Desktop 基础安全地基；PP-02（必须）在 T012 完成后先进行 Web 契约复习。

---

## Phase 3: User Story 4 - 在受控安全边界内使用桌面窗口（Priority: P1）

**Goal**: 建立远程工作窗口的零本机 API 边界，并只在可证明的极窄条件下交给系统浏览器打开外链。

**Independent Test**: 非受信导航、redirect/frame、popup、未声明权限、不安全 scheme 与无法验证的外链均被拒绝；通过 Windows behavior gate 的安全外链不会在 Electron 中嵌入。

### Tests for User Story 4

- [x] T021 [P] [US4] 创建 Windows external-opening behavior gate 测试页与记录断言：`apps/desktop/tests/integration/fixtures/external-opening.html`、`apps/desktop/tests/integration/external-opening.behavior.test.ts`，分别采集 pointer/keyboard `target=_blank`、`window.open`、synthetic click、form target 的 `url`、`disposition` 与 `postBody`。
- [x] T022 [P] [US4] 为 navigation、popup、permission、certificate、external URL parser 和 deny-by-default policy 编写单元测试：`apps/desktop/tests/unit/security-policy.test.ts`。
- [x] T023 [US4] 实现 `apps/desktop/src/main/security-policy.ts` 的 exact Origin navigation、frame/redirect、permission、certificate、外链与 `shell.openExternal` policy；任何未被 behavior gate 稳定区分的外链向量保持 deny。
- [x] T024 [US4] 在 `apps/desktop/src/main/main.ts` 创建 workspace window 安全基线：显式 WebPreferences、无 preload、无 Node、无 webview、无 experimental feature，并为 window/session 接入 `security-policy.ts`。
- [x] T025 [US4] 在 `apps/desktop/src/main/main.ts` 接入 `setWindowOpenHandler`、`will-navigate`、`will-frame-navigate`、`will-redirect`、两个 permission handler 与 certificate 拒绝路径，确保 renderer 没有任何 `shell`/IPC 访问能力。
- [x] T026 [US4] 在 `apps/desktop/tests/integration/window-security.test.ts` 覆盖 remote window 的 WebPreferences、sender/source 限制、所有 navigation/popup/permission deny path 及系统浏览器外链结果。
- [x] T027 [US4] 将 behavior gate 的实际 Windows 结果、允许的 disposition 集合和被拒绝的向量记录到 `specs/v0.5.0-electron-desktop-host/research.md`；若无法可靠区分，不扩大 `apps/desktop/src/main/security-policy.ts` 的允许范围。

**Checkpoint**: 远程工作页面在安全模型中始终是非特权内容；外链策略已经过 Windows 行为证据约束。

**Learning Pause PP-04（必须）**：查看 behavior gate 证据、允许集合和 deny-by-default 策略。

---

## Phase 4: User Story 5 - 在服务异常或手动升级后安全恢复入口（Priority: P1）

**Goal**: 在兼容性、TLS、网络或首屏失败时，在同一个 5 秒总预算内切换到隔离的本地 recovery 页，而不降低安全要求。

**Independent Test**: `compatible` 才能进入 workspace；`manual_upgrade_required`、network/TLS/HTTP/schema/timeout 均显示本地恢复页，重试只访问固定 Origin，诊断不上传。

### Tests for User Story 5

- [x] T028 [P] [US5] 为 `ses.fetch()` request、strict v1 response、`minimumDesktopVersion` 必须严格高于当前版本、错误码映射、5 秒剩余 deadline 与 stale attempt 编写单元测试：`apps/desktop/tests/unit/compatibility.test.ts`。
- [x] T029 [US5] 实现 `apps/desktop/src/main/compatibility.ts`，只使用 workspace profile `ses.fetch()`、`credentials: 'omit'` 和 fixed compatibility path；严格验证 status、content type、JSON、contractVersion、semver 与 `manual_upgrade_required` 的最低版本关系，绝不使用 Node HTTP/TLS bypass。
- [x] T030 [P] [US5] 为 recovery bridge 的 sender、window kind、schema、并发状态和无升级 URL 约束编写测试：`apps/desktop/tests/integration/recovery-bridge.test.ts`。
- [x] T031 [US5] 创建 `apps/desktop/src/recovery-renderer/index.html`、`apps/desktop/src/recovery-renderer/main.ts` 与 `apps/desktop/src/recovery-renderer/styles.css`，显示 safe error code、当前/最低版本、内部渠道升级说明、重试、确认 reset 和诊断操作；不得引用外部资源或升级 URL。
- [x] T032 [US5] 创建 `apps/desktop/src/preload/recovery-preload.ts`，只通过 `contextBridge` 暴露 `retry`、`confirmResetProfile`、`copyDiagnostic`、`exportDiagnostic` 的具名 DTO，不暴露 `ipcRenderer`、通道名或 Node module。
- [x] T033 [P] [US5] 为 safe diagnostic allowlist、copy/export 结果、取消与敏感字段排除编写单元测试：`apps/desktop/tests/unit/diagnostics.test.ts`。
- [x] T034 [US5] 实现 `apps/desktop/src/main/diagnostics.ts`，依照 `contracts/desktop-support-diagnostic.md` 构造诊断；仅本地 copy/export，不序列化 chat、cookie、Prompt、key、raw error、路径或 request header。
- [x] T035 [P] [US5] 为确认后定向清除、失败后重新 compatibility check、reset 优先于 retry、reset 期间 second-instance、无 server delete request 和 recovery session 隔离编写测试：`apps/desktop/tests/integration/profile-reset.test.ts`。
- [x] T036 [US5] 在 `apps/desktop/src/main/session-profile.ts` 实现 confirmed reset：先销毁 workspace，再仅清除 trusted Origin 的 browser data，完成或失败后重新进入 compatibility check，不删除 server session、memory 或 StreamRun。
- [x] T037 [US5] 在 `apps/desktop/src/main/main.ts` 连接 compatibility、host-state、local protocol、recovery renderer、preload 与 diagnostics，保证仅 current attempt 可创建 workspace，任何失败 fail closed 到 recovery。
- [x] T038 [US5] 在 `apps/desktop/tests/integration/recovery-flow.test.ts` 覆盖 compatible、manual upgrade、无效最低版本、offline、DNS/TLS、HTTP/schema、总 deadline、重复 retry、reset 优先级、profile/recovery bootstrap fail-closed 和 recovery IPC 的端到端状态转换。

**Checkpoint**: 失败恢复完全由包内隔离页面处理，且没有任意 URL、cookie、诊断上传或安全降级路径。

**Learning Pause PP-05（必须）**：查看 compatibility admission、5 秒总预算和 recovery 状态转换。

---

## Phase 5: User Story 1 - 从桌面应用使用 AI Mind（Priority: P1） 🎯 Safe MVP

**Goal**: 在通过安全兼容性门后，从 Windows 系统入口进入固定线上 AI Mind 工作界面，完成普通聊天。

**Independent Test**: 支持的内部预览安装包在正常网络下 10 秒内进入独立 workspace，并完成一次普通聊天与流式回答，且不打开普通浏览器。

### Tests for User Story 1

- [x] T039 [P] [US1] 为单实例、Squirrel startup、workspace load 只发生在 compatible 后、首次首屏 deadline、第二实例聚焦，以及正常 workspace 中原生 About/版本入口编写 integration 测试：`apps/desktop/tests/integration/desktop-startup.test.ts`。启动计时必须从首次 `attemptId` 创建开始，到 fixed Trusted AI Mind Origin 工作窗口可见且现有聊天输入可交互结束；记录 Windows 版本、Desktop Release、服务版本/compatibility state 与耗时。
- [x] T040 [US1] 在 `apps/desktop/src/main/main.ts` 与 `apps/desktop/src/main/application-menu.ts` 实现 app lifecycle、single-instance lock、Squirrel startup 处理、窗口聚焦、仅在 compatibility 成功后 `loadURL(trustedOrigin)` 的启动链路，以及无论 workspace 或 recovery 状态均可用的原生 About/版本入口；该入口只由 main process 构造，显示 desktop version、`internal-preview`、`unsigned` 与 fixed Origin，不加载远程内容、不打开升级 URL，也不向 workspace renderer 暴露 bridge。
- [x] T041 [US1] 在 `apps/desktop/package.json`、`apps/desktop/forge.config.ts` 接入 development start、Windows make 与 preview make script，使开发 Origin 仅由未打包进程的显式变量提供。
- [x] T042 [US1] 在 `apps/desktop/tests/integration/workspace-chat.test.ts` 使用受控 webapp fixture 或本机开发服务覆盖普通聊天、流式显示、停止与既有错误反馈均由线上页面处理，desktop 不插入业务 IPC。
- [x] T043 [US1] 创建 `apps/desktop/tests/packaged/startup-smoke.md`，记录 Windows x64 fresh install、未注入限速或故障的真实受信 HTTPS 网络路径下从首次 `attemptId` 创建到聊天输入可交互的 10 秒启动验收、普通聊天、single-instance 与原生 About/版本入口的可重复人工 smoke 步骤；证据包含 Windows 版本、Desktop Release、服务版本/compatibility state、实测耗时且不含用户数据。

**Checkpoint**: Safe MVP 可安全加载线上普通聊天，且 desktop 仍只是宿主而非第二套 AI Runtime。

**Learning Pause PP-06（必须）**：查看启动链路、首屏计时、普通聊天和原生 About/版本入口。

---

## Phase 6: User Story 2 - 在桌面端继续使用现有高级能力（Priority: P1）

**Goal**: 证明现有图像生成、受控 Agent、会话列表及 StreamRun 终态恢复在 desktop workspace 中保持 webapp 的既有语义。

**Independent Test**: 在 desktop workspace 中完成图像生成入口、受控 Agent、会话打开，并在流式任务运行期间关闭/崩溃/休眠后只读取既有 hydration 与持久化终态。

### Tests for User Story 2

- [x] T044 [P] [US2] 在 `apps/desktop/tests/integration/workspace-existing-features.test.ts` 覆盖图像生成入口、受控 Agent、会话列表和已有会话打开，断言 desktop 未添加模型、Agent、MCP 或数据库旁路。
- [x] T045 [P] [US2] 在 `apps/desktop/tests/integration/stream-lifecycle.test.ts` 覆盖关闭窗口、`render-process-gone`、休眠/恢复与 second-instance，断言不调用 cancel、不重新挂接活动订阅、不伪造终态。
- [x] T046 [US2] 在 `apps/desktop/src/main/main.ts` 实现 workspace close、renderer crash、suspend/resume 和第二实例的最小生命周期处理，保持现有 webapp StreamRun/hydration 事实源。
- [x] T047 [US2] 扩充 `apps/desktop/tests/packaged/startup-smoke.md`，加入受控 Agent、会话历史、图像生成和关闭后恢复的 Windows 手工 smoke，记录结果而不采集聊天、cookie 或 Prompt。

**Checkpoint**: desktop 复用既有高级 Runtime，而不是重写或改变其权限、cancel、恢复与数据归属。

**Learning Pause PP-07（建议）**：查看高级能力复用和流式生命周期边界。

---

## Phase 7: User Story 6 - 安全保存现有图像生成结果（Priority: P1）

**Goal**: 只允许当前受信 workspace 中真正由用户发起、无 redirect 的图像保存；保留现有文本 copy，同时拒绝剪贴板读取和任意文件能力。

**Independent Test**: 合法图像进入系统保存流程；自动、redirect、外站、不安全 scheme/name/MIME、recovery/subframe 下载及 clipboard read 均被拒绝且不写文件。

### Tests for User Story 6

- [x] T048 [P] [US6] 为 main-frame 来源、`DownloadItem.hasUserGesture()`、单一 trusted-Origin Blob URL、strict image-result Blob 生命周期、文件名、MIME/扩展名、失效/中断/取消与 save dialog options 编写单元测试：`apps/desktop/tests/unit/download-policy.test.ts`。
- [x] T049 [US6] 在 `apps/desktop/src/main/security-policy.ts` 实现 deny-by-default `will-download` 策略，只允许受信 ImageResult Blob、单一安全 URL chain 和原生 user gesture；只调用 `setSaveDialogOptions`，不设置/保存 file path，也不回退为内容路由下载。
- [x] T050 [P] [US6] 在 `apps/desktop/tests/integration/download-and-clipboard.test.ts` 覆盖受信图片 Blob、同源图片结果、自动下载、redirect、非受信来源、native dialog 取消、clipboard write/read 与未声明权限。
- [x] T051 [US6] 在 `apps/desktop/src/main/main.ts` 将 workspace profile 的 `will-download` 与 clipboard permission policy 接入 `security-policy.ts`，确保 recovery session、subframe 和外站无法继承例外。
- [x] T052 [US6] 在 `apps/desktop/tests/packaged/startup-smoke.md` 增加真实 Windows 系统保存对话框、取消保存、图像文件扩展名和文本复制的人工 smoke 边界。

**Checkpoint**: 图像保存的本机文件能力是窄例外，不演变为通用下载、上传、目录选择或 renderer 文件 API。

**Learning Pause PP-08（建议）**：查看下载、剪贴板和系统保存对话框的安全边界。

---

## Phase 8: User Story 3 - 保持桌面会话连续性（Priority: P2）

**Goal**: 让 desktop 与普通网页端使用服务端统一、滑动 30 天的持久 cookie，同时保持 Windows 用户 profile 隔离与本地 reset 边界。

**Independent Test**: 同一 Windows 用户关闭/重开或覆盖安装后保留可访问会话；cookie 失效/拒绝时不显示其他身份数据；compatibility API 不写入或续期 cookie。

### Tests for User Story 3

- [x] T053 [P] [US3] 扩充 `apps/webapp/tests/lib/ai/rate-limit/session-id.test.ts`，先覆盖新建与既有会话的 30 天 `Max-Age`/`Expires`、`HttpOnly`、`SameSite=Lax`、production `Secure` 和滑动续期。
- [x] T054 [US3] 修改 `apps/webapp/lib/ai/rate-limit/session-id.ts`，使每次成功解析既有正常会话均重新签发固定安全属性、30 天滑动续期的同一 session cookie，同时维持非法 secure 配置 fail closed。
- [x] T055 [US3] 更新 `apps/webapp/tests/app/api/chat/conversations/route.test.ts`、`apps/webapp/tests/app/api/chat/thread/route.test.ts`、`apps/webapp/tests/app/api/chat/runs-stream-route.test.ts`、`apps/webapp/tests/app/api/chat/runs-image-route.test.ts` 与 `apps/webapp/tests/app/api/chat/runs-cancel-route.test.ts`，断言既有正常会话请求会续期而 compatibility API 始终无 `Set-Cookie`。
- [x] T056 [P] [US3] 在 `apps/desktop/tests/integration/session-continuity.test.ts` 覆盖 close/reopen、cookie 被服务端拒绝、confirmed reset、same-product overlay install 与不同 Windows 用户 profile 的会话可见性边界。
- [x] T057 [US3] 在 `apps/desktop/src/main/session-profile.ts` 与 `apps/desktop/src/main/main.ts` 固化稳定 partition/userData/product identity 的覆盖安装语义；主进程不得读取、构造或续期 cookie 值。
- [x] T058 [US3] 扩充 `apps/desktop/tests/packaged/startup-smoke.md`，加入 30 天滑动会话、同产品覆盖安装、失效会话和 reset 不删除 server data 的人工验收记录。

**Checkpoint**: 会话授权仍由线上服务负责；desktop 只安全保存 Chromium 已收到的资料，不新增本地身份系统。

**Learning Pause PP-09（建议）**：查看服务端滑动 cookie、profile 连续性与 reset 边界。

---

## Phase 9: Repository Release Readiness

**Purpose**: 接入 Windows CI、生产验证、内部预览制品治理、文档与版本收口，确保没有绕开既有两条 server deployment route。

- [x] T059 [P] 为 desktop test lane 与 CI workflow 约束更新治理测试：`scripts/validate/validate-test-lanes.test.mjs`、`scripts/validate/validate-ci-workflow.test.mjs`。
- [x] T060 更新 `scripts/validate/validate-test-lanes.mjs`、`scripts/validate/validate-ci-workflow.test.mjs` 与 `.github/workflows/ci.yml`，新增不持有生产 secret、不执行 server deploy 的 Windows x64 desktop job：锁定依赖安装、desktop unit、development Electron integration、不可分发的 `make:windows` 与 artifact/fuse/hash 验证；CI 不得执行、命名、上传或标记 `preview:make` 制品。`preview:make` 仅可在同一 commit 的 server compatibility API/document security headers 生产验证通过后，由受控内部预览发布流程执行。
- [x] T061 在 `deploy/scripts/verify-production.sh` 增加候选 `X-AI-Mind-Desktop-Version` 的 compatibility API strict response、`Cache-Control: no-store`、无 cookie、副作用隔离，以及 `/`、`/instant-mind` document CSP/security header 验收；不得输出 cookie 或 secret。
- **Learning Pause PP-10（必须）**：T061 生产验证完成后暂停；确认 server-first gate 通过，才允许任何 `preview:make`、manifest/hash 生成或内部预览分发。
- [x] T062 同步 `docs/architecture/production-deployment.md`、`specs/v0.5.0-electron-desktop-host/contracts/desktop-preview-release.md` 与 `specs/v0.5.0-electron-desktop-host/quickstart.md`，明确先 server 后 preview artifact、仅两条 server deploy route、暂停 preview 分发后的 rollback 规则。
- [x] T063 创建 `docs/adr/0017-secure-electron-desktop-host.md` 与 `docs/architecture/desktop-host.md`，沉淀 online host、固定 Origin、零 bridge、profile/recovery 分离、compatibility gate、下载/外链、fuse 与未签名内部预览边界。
- [x] T064 创建 `docs/versions/v0.5.0-electron-desktop-host.md`、`docs/releases/v0.5.0.md` 与 `docs/tasklists/v0.5.0-electron-desktop-host-tasklist.md`，说明已交付范围、Non-goals、内部预览分发限制、手工升级、回退和验证证据。
- [x] T065 更新 `README.md` 与 `specs/v0.5.0-electron-desktop-host/quickstart.md`，使桌面能力、支持平台、内部预览限制、开发/验证命令与真实 scripts 一致，不把未签名制品描述为公开发行物。
- [x] T066 补全 `specs/v0.5.0-electron-desktop-host/acceptance.md` 中同一 source commit 的责任角色、Windows 版本、desktop release、server compatibility 状态、CI、fresh/overlay install、fuse/hash、CSP/API 和固定 success-criteria evaluation set 的脱敏证据，不记录用户内容、cookie、Prompt 或 secret。
- [x] T067 执行并记录与本版本相关的门禁命令到 `specs/v0.5.0-electron-desktop-host/acceptance.md`：`pnpm lint`、`pnpm typecheck`、`pnpm test:stable`、`pnpm build`、desktop Windows job 与生产 `verify-production.sh`；失败项必须在同一文件列为未完成风险。
- [x] T068 在 `specs/v0.5.0-electron-desktop-host/tasks.md`、`spec.md`、`plan.md`、`data-model.md`、`contracts/` 与 `research.md` 同步任何实现中确认的 contract、fuse、CI、部署或安全边界变更，避免规格漂移。
- [x] T069 完成 `speckit-analyze`、阶段工程审计与 `speckit-converge`，将发现与剩余任务回写 `specs/v0.5.0-electron-desktop-host/tasks.md`，再进行内部预览 release closing。
- **Learning Pause PP-11（必须）**：T069 完成后进行最终代码、测试、规格漂移和验收证据复习，再进入 release closing。

---

## Dependencies & Execution Order

### Foundational and Story Dependencies

**Current execution order overrides historical task-number order**: complete Phase 1-9, the T070 convergence baseline, Phase 11 development follow-up (T076-T077, T086-T105), Phase 12 macOS arm64 extension, and Phase 12.5 pre-release audit remediation before starting Phase 13. T071-T075 are final operational release gates despite their lower numeric IDs.

```text
Phase 9 repository release preparation
  -> Phase 10 convergence baseline (T070)
  -> Phase 11 development follow-up (T076-T077, T086-T105)
  -> Phase 12 macOS arm64 extension (T078-T085)
  -> Phase 12.5 pre-release audit remediation (T106-T109)
  -> Phase 13 operational release closing (T071-T075)
```

```text
Phase 1 Setup
  → Phase 2 Foundational
  → US4 安全窗口边界
  → US5 compatibility / recovery
  → US1 Safe MVP：正常 workspace + 普通聊天
  ├─→ US2 既有高级能力
  ├─→ US6 受信图像保存
  └─→ US3 会话连续性
       → Phase 9 Repository Release Readiness
```

- **Phase 1**：无前置，可立即开始。
- **Phase 2**：依赖 Setup；它提供所有故事共享的 server contract、CSP、build config、profile 和 local protocol。
- **US4**：依赖 Phase 2；必须先通过 external-opening behavior gate，不能为赶进度放宽外链。
- **US5**：依赖 Phase 2 和 US4 的安全 window 基线；为后续 workspace 提供唯一 admission/recovery gate。
- **US1**：依赖 US4、US5；构成可交付的 Safe MVP。
- **US2、US6、US3**：都依赖 US1；三者可在不同文件边界下并行推进。US6 还依赖 US4，US3 复用 US5 的 profile/reset 基础。
- **Phase 9**：依赖所有计划交付的用户故事；生产 server 发布与 desktop preview 分发遵循 `contracts/desktop-preview-release.md` 的先后顺序。

### Parallel Opportunities

- Phase 2 可并行先写 web compatibility tests（T007）、header tests（T011）、desktop build/fuse tests（T013）、profile/state tests（T015）、local protocol tests（T017）和 artifact tests（T019）。
- US4 可并行收集外链行为证据（T021）与编写 security policy tests（T022）；T023 以后才能决定允许集合。
- US5 可并行开展 compatibility tests（T028）、recovery bridge tests（T030）、diagnostic tests（T033）和 reset tests（T035）。
- US1 完成后，US2 的 feature/stream tests（T044、T045）、US6 的 download tests（T048、T050）和 US3 的 cookie/profile tests（T053、T056）可由不同开发者并行承担。
- 收口阶段可并行准备 CI validator tests（T059）、部署验证脚本（T061）、架构文档（T063）和版本公开文档（T064），但 T062、T065、T066、T067、T068、T069 必须按实际发布结果收敛。

## Implementation Strategy

### Safe MVP First

1. 完成 Phase 1 与 Phase 2，先把 server compatibility/CSP 和 desktop 可信边界稳定下来。
2. 完成 US4 与 US5，确认任何失败都会 fail closed 到隔离 recovery。
3. 完成 US1：只有通过 compatibility gate 才打开固定线上 workspace，并验证普通聊天。
4. 在此 checkpoint 做 Windows Safe MVP smoke；尚未完成高级能力、图像保存、会话滑动续期或内部预览分发时，不得把它称为 v0.5.0 候选。

### Incremental Delivery

1. Safe MVP（US4 + US5 + US1）→ 安全在线宿主。
2. US2 → 证明既有图像/Agent/StreamRun 语义没有被 desktop 改写。
3. US6 → 加入受约束的本地图像保存。
4. US3 → 补齐桌面/网页统一的滑动会话、reset 与覆盖安装连续性。
5. Phase 9 → Windows CI、生产 contract 验证和受控内部预览制品收口。

## Notes

- 不得在本版把聊天、Agent、MCP、模型、数据库或 StreamRun 搬进 `apps/desktop/`；desktop 是在线宿主。
- 不得为了测试在生产 desktop 中加入 test-only IPC、开关、Origin fallback、TLS bypass 或可编辑服务地址。
- `T061` 只能增强既有 GitHub Actions Release (TCR) → server 和 Local PowerShell Ops → TCR → server 两条正式 server deployment route，不能新增第三条。
- 每一项完成前应执行与该项最贴近的测试；任务清单的 `[x]` 是开发记录，不取代测试、实际 diff、spec 同步和审计证据。

---

## Phase 10: Convergence Baseline

- [x] T070 修正 `data-model.md` 与 `acceptance.md` 中已发现的 release evidence 漂移：使用实际 `cloud.hwyblog.ai-mind.desktop` product identity，并将已实际执行的本地质量门禁和审计状态与未完成的 production/Windows evidence 明确区分（FR-002、FR-011、FR-012、FR-013、SC-011；partial）。

---

## Phase 11: Development Follow-up

- [x] T076 为 `apps/desktop` 的 Forge 开发入口增加 Node 22 原生 `.env.local` 加载与 localhost 默认值，提供 `dev` 别名，并同步 README、quickstart、spec 与 plan；不得让开发配置进入 `make`、`preview:make` 或 packaged runtime（FR-002；implementation follow-up）。
- [x] T077 将 v0.5.0 桌面端本地用户界面统一为简体中文：原生 About/安全对话框、recovery-renderer、诊断导出和图像保存对话框；保留错误码、协议值、诊断 JSON 字段与 IPC 枚举的英文机器可读契约，并同步 smoke/spec/quickstart 文档。
- [x] T086 修正 `/instant-mind` 在小于 `lg` 断点时的响应式布局：将移动会话栏移至 `chat-main-column` 之外，使其相对页面外层通栏，同时保留标题、消息和输入区的 `53.5rem` 内容列；补充页面结构回归断言，并保持 `lg` 桌面侧栏和 Electron 原生“关于”菜单不变（FR-026）。
- [x] T087 初始 local Chrome 尝试：使用 Electron `titleBarOverlay` 与包内 local Chrome 承载 AI Mind 标识、既有“查看”和“帮助”菜单，并隐藏 application menu 行。该实现的 Forge 资源白名单、严格 CSP、拖动层和跨平台安全区不足，已由 T088-T091 替代。
- [x] T088 [P] 为 Forge 实际的 local Chrome/recovery entry、严格 CSP 外部 CSS、菜单 sender contract 和 `/instant-mind` workspace 路径补充失败优先测试，覆盖 Windows/macOS title-bar layout policy 与未知资源拒绝：`apps/desktop/tests/unit/local-protocol.test.ts`、`apps/desktop/tests/unit/desktop-chrome-bridge.test.ts`、`apps/desktop/tests/unit/build-config.test.ts`、`apps/desktop/tests/integration/desktop-startup.test.ts`（FR-027-FR-029）。
- [x] T089 对齐 `apps/desktop/forge.config.ts`、`webpack.renderer.config.cjs`、`src/{chrome-renderer,recovery-renderer}/` 与 `src/main/local-protocol.ts`：只加载 Forge 实际输出的本地 HTML/JS/CSS，移除运行时内联 style 注入，并在不放开 CSP 的前提下保持路径严格白名单（FR-028）。
- [x] T090 在 `apps/desktop/src/main/desktop-host.ts`、`src/chrome-renderer/` 与 `src/main/host-runtime.ts` 落实亮色 VS Code-style Desktop Chrome：Windows 原生 overlay controls、macOS native traffic lights、独立 drag layer、`no-drag` 菜单、安全区和固定 `/instant-mind` workspace；远程 View 继续零 bridge（FR-027、FR-029）。
- [x] T091 验证并同步 `specs/v0.5.0-electron-desktop-host/{acceptance.md,contracts/desktop-host-policy.md,research.md,quickstart.md}`、`docs/{architecture/desktop-host.md,adr/0017-secure-electron-desktop-host.md}`：运行 desktop tests、真实 Forge smoke 与 Windows/macOS 验收路线，确认顶栏无 CSP 拒绝、菜单可用、空白区可拖动且系统控制不重叠（FR-027-FR-029）。
- [x] T092 [P] 为 Web document `style-src 'unsafe-inline'` CSS 兼容例外补充失败优先 header contract 测试，验证 `/` 与 `/instant-mind` 允许该值，且 `script-src`、API/static/prefetch 与 Electron local CSP 不继承该例外：`apps/webapp/tests/app/browser-security-headers.test.ts`（FR-023）。该组合因 Chromium 的 nonce 优先规则被 T095-T097 superseded。
- [x] T093 在 `apps/webapp/lib/security/browser-security-headers.ts` 实现 Web document `style-src 'unsafe-inline'`，不改变 `proxy.ts` 路由边界、nonce、`script-src`、权限或 Electron local CSP（FR-023）。实现细节因 Chromium 的 nonce 优先规则被 T096 修正。
- [x] T094 验证并同步 `specs/v0.5.0-electron-desktop-host/{spec.md,plan.md,tasks.md,acceptance.md,research.md,quickstart.md,contracts/web-security-headers.md}`、`docs/{architecture/desktop-host.md,adr/0017-secure-electron-desktop-host.md}`：运行 web header 回归、typecheck、lint 与 browser smoke，记录 CSS 例外的 Web-only 边界（FR-023）。旧验证记录因策略修正由 T097 更新。
- [x] T095 [P] 为统一 Web CSS policy 补充失败优先 header contract 测试：`style-src` 必须精确为 `'self' 'unsafe-inline'`，不得带 nonce/hash 或 `style-src-attr`；`script-src`、API/static/prefetch 和 Electron local CSP 必须保持既有边界：`apps/webapp/tests/app/browser-security-headers.test.ts`（FR-023）。
- [x] T096 在 `apps/webapp/lib/security/browser-security-headers.ts` 移除 Web document `style-src` 的 nonce 与 `style-src-attr`，使所有 document CSS 均由 `unsafe-inline` 生效；不改变 `script-src`、proxy 路由边界、权限或 Electron local CSP（FR-023）。
- [x] T097 验证并同步 `specs/v0.5.0-electron-desktop-host/{spec.md,plan.md,tasks.md,acceptance.md,research.md,quickstart.md,contracts/web-security-headers.md}`、`docs/{architecture/desktop-host.md,adr/0017-secure-electron-desktop-host.md}`：运行 web header 回归、typecheck、lint 与浏览器 document 请求，确认 Radix/Next 开发样式不再触发 CSP 拒绝（FR-023）。
- [x] T098 [P] 为 Chrome 与 recovery 的统一本地 CSS policy 补充失败优先 protocol contract 测试：两种 local HTML 响应均必须为 `style-src 'self' 'unsafe-inline'`，且 `script-src 'self'` 与禁止 `unsafe-eval` 保持不变：`apps/desktop/tests/unit/local-protocol.test.ts`（FR-023、FR-028）。
- [x] T099 在 `apps/desktop/src/main/local-protocol.ts` 将包内 Chrome/recovery 的 `style-src` 统一为 `'self' 'unsafe-inline'`；不得改变 `script-src`、本地资源白名单、protocol privilege、remote workspace 或 IPC sender 边界（FR-023、FR-028）。
- [x] T100 验证并同步 `specs/v0.5.0-electron-desktop-host/{spec.md,plan.md,tasks.md,acceptance.md,research.md,quickstart.md,contracts/desktop-host-policy.md,contracts/web-security-headers.md}`、`docs/{architecture/desktop-host.md,adr/0017-secure-electron-desktop-host.md}`：运行 local-protocol 回归、desktop typecheck 与 lint，记录 CSS-only 例外不允许 `unsafe-eval` 或白名单外资源（FR-023、FR-028）。
- [x] T101 在 `apps/desktop/webpack.renderer.config.cjs` 显式使用 `devtool: 'source-map'`，覆盖 Forge development 的 `eval-source-map` 默认值，使包内 Chrome/recovery renderer 在 `script-src 'self'` 下不需要 `unsafe-eval`；不新增回归测试，变更后必须重启 Forge development process 才会重建 bundle（FR-027、FR-028）。
- [x] T102 在 `apps/desktop/src/main/main.ts` 固定 Electron `nativeTheme.themeSource = 'light'`，并将 Windows `titleBarOverlay` 高度设为 39px 为 renderer 底边线保留 1px；不新增独立测试案例，仅更新既有 title-bar policy 期望值并同步验收文档（FR-027）。
- [x] T103 修正本地 Desktop Chrome 的拖动命中范围：`no-drag` 仅覆盖 AI Mind 标识和既有“查看”“帮助”菜单的实际内容宽度，顶栏其余可见空白由底层 drag layer 接管；移除 Windows 右侧控制区的内容内边距假设，保留 macOS traffic lights 安全区，不新增独立测试案例（FR-027）。
- [x] T104 为 `apps/desktop/src/main/desktop-host.ts` 的 Desktop Chrome 窗口设置 `1280 × 800` 首次创建尺寸，使 `lg` 桌面会话侧栏默认可见；保留 `720 × 480` 最小尺寸，允许用户主动缩小时进入现有响应式布局，不新增独立测试案例（FR-027）。
- [x] T105 从 `apps/webapp/public/brand/ai-mind-icon.png` 生成透明 AI Mind PNG 母版及 Windows `.ico`、macOS `.icns`，接入 Forge `packagerConfig.icon`、Windows Squirrel `setupIcon` 与开发态窗口/Dock 图标；`Setup.exe`、`Update.exe` 和已打包应用使用同一品牌资产，且不增加安装时远程 `iconUrl` 依赖。为图标容器与 Forge 配置补充稳定测试，并同步发布验收要求（FR-001）。

---

## Phase 12: macOS arm64 Internal Preview Extension

**Purpose**: 在不改变 online-host、零远程 bridge、固定 Origin 或 server-first 发布边界的前提下，为 Apple Silicon Mac 增加未签名 DMG 内部预览制品；不支持 Intel Mac、universal binary、Developer ID signing 或 notarization。

- [x] T078 [P] 为跨平台 `DesktopPreviewManifest` 与 `DesktopSupportDiagnostic` 添加先行测试，覆盖 `win32-x64`/`darwin-arm64` allowlist、`win32`/`darwin` runtime 值、拒绝 Intel/universal 平台和 macOS arm64 manifest/hash 一致性：`apps/desktop/tests/unit/release-artifact.test.ts`、`apps/desktop/tests/unit/diagnostics.test.ts`（FR-020、FR-025、SC-013）。
- [x] T079 [P] 为 Forge macOS packaging policy 添加测试或静态验证，覆盖 arm64-only maker、Windows-only Squirrel lifecycle、macOS `.app` fuse executable 路径与 ad-hoc re-sign 边界：`apps/desktop/tests/unit/forge-config.test.ts`、`apps/desktop/tests/integration/desktop-startup.test.ts`（FR-001、FR-011、FR-025、SC-012）。
- [x] T080 更新 `apps/desktop/package.json`、`pnpm-lock.yaml`、`apps/desktop/forge.config.ts`，接入 `@electron-forge/maker-dmg@7.11.2`、`make:macos-arm64`/`preview:make:macos-arm64`，在 `postPackage` 对 Windows x64 与 macOS arm64 分别 flip fuses，并仅对 macOS bundle 执行 ad-hoc `codesign --sign -`；其他 platform/arch 必须 fail closed（FR-001、FR-011、FR-025）。
- [x] T081 更新 `apps/desktop/src/main/main.ts`、`apps/desktop/src/main/desktop-host.ts`、`apps/desktop/src/main/diagnostics.ts` 与相关类型，确保 Squirrel startup 只在 Windows 触发、运行时诊断如实记录 Windows x64 或 macOS arm64、profile/reset 和安全边界不因平台扩展而放宽（FR-005、FR-014、FR-015、FR-020）。
- [x] T082 更新 `apps/desktop/scripts/release-artifact-utils.mjs`、`apps/desktop/scripts/release-artifact-utils.d.mts`、`apps/desktop/scripts/write-release-manifest.mjs`、`apps/desktop/scripts/verify-release-artifact.mjs` 和 `apps/desktop/scripts/verify-pnpm-builds.mjs`，使 manifest、artifact verifier、package-content audit 与 clean-install evidence 接受明确平台参数，并拒绝 `darwin-x64`/universal（FR-011、FR-012、FR-022、FR-025、SC-013）。
- [x] T083 更新 `.github/workflows/ci.yml`、`scripts/validate/validate-ci-workflow.test.mjs`、`scripts/validate/validate-test-lanes.mjs` 与对应测试，新增不持有 production secret、不上传 artifact 的原生 macOS arm64 job；该 job 必须断言 runner/产物均为 arm64，并执行 test、DMG、fuse/hash/ASAR audit（FR-023、SC-012、SC-013）。
- [x] T084 更新 `apps/desktop/tests/packaged/startup-smoke.md`、`specs/v0.5.0-electron-desktop-host/acceptance.md`、`README.md`、`docs/architecture/desktop-host.md`、`docs/adr/0017-secure-electron-desktop-host.md`、`docs/versions/v0.5.0-electron-desktop-host.md`、`docs/releases/v0.5.0.md` 与 `docs/tasklists/v0.5.0-electron-desktop-host-tasklist.md`，增加 macOS arm64 DMG、Gatekeeper 人工打开、fresh/overlay install、平台化诊断与 server-first 发布证据规则（FR-001、FR-020、FR-025、SC-012、SC-013）。
- [x] T085 执行 `pnpm --filter @ai-mind/desktop lint`、`pnpm --filter @ai-mind/desktop typecheck`、`pnpm --filter @ai-mind/desktop test:stable`、CI validator tests、`git diff --check`，并在 `acceptance.md` 区分本地 Windows 验证、待运行的 macOS arm64 CI/DMG 验证与仍被 T071/T072 阻塞的受控 preview 分发（FR-023、SC-012、SC-013）。

**Checkpoint**: macOS arm64 代码、契约、CI 与人工验收路线完整，但任何 `preview:make:macos-arm64`、manifest/hash 生成或受控内部渠道分发仍必须等待 T071/T072 的 server-first gate。

---

## Phase 12.5: Pre-release Audit Remediation

**Purpose**: 在 source commit、server deploy、preview artifact 或分发开始前，修复审计确认的 release verifier、local recovery 和实际 package-content audit 缺口；本阶段不执行 T071-T075，也不生成或分发制品。

- [x] T106 [P] 修正 `deploy/scripts/verify-production.sh` 的大小写无关 header 解析与 document CSP 校验，使其精确接受 `style-src 'self' 'unsafe-inline'`，并拒绝 style nonce/hash 与 `style-src-attr`；新增 Linux deployment-host 行为型 regression test `scripts/validate/verify-production-desktop-contract.test.mjs`（FR-023）。
- [x] T107 在 `apps/desktop/src/main/{desktop-host.ts,host-runtime.ts}` 中使本地 Chrome/recovery bootstrap failure fail closed：等待 Chrome/recovery load、销毁未初始化 shell、回到 `WORKSPACE_LOAD_FAILED` 或 `LOCAL_RECOVERY_UNAVAILABLE`；native safe dialog 的 retry 重新执行完整 attempt，exit 调用应用退出。补充 `apps/desktop/tests/integration/recovery-flow.test.ts` 覆盖（FR-014）。
- [x] T108 在 `apps/desktop/scripts/release-artifact-audit.mjs` 中实际枚举 `app.asar` 条目，并与外部 package path 使用同一敏感文件名规则；检查 entry 内容中的私钥、证书和 `autoUpdater` 标记。将 `@electron/asar` 声明为直接 devDependency，并在 `apps/desktop/tests/unit/release-artifact.test.ts` 以真实 archive 断言 `.env.production` 被拒绝（FR-011、FR-012）。
- [x] T109 运行 desktop typecheck、lint、stable/integration tests 与 governance validators，记录当前 Windows 环境跳过 Linux-only production verifier behavior test；同步 canonical spec、plan、tasks、data model、contracts、ADR 与 architecture docs。`bash -n` 因本机 WSL Bash service `E_ACCESSDENIED` 未运行，production script 的实际执行仍仅属于 T072（FR-014、FR-023）。

- [ ] T110 修复 Electron 43 打包可执行文件在主进程启动前退出的问题：禁用与缺失 `browser_v8_context_snapshot.bin` 不兼容的 `LoadBrowserProcessSpecificV8Snapshot`，让源配置、fuse unit/artifact verifier、canonical specs、ADR 与 architecture docs 一致；在可清理旧输出后重建 Windows package，并读取实际 fuse wire 和运行 startup smoke（FR-011、T068）。
- [x] T111 修复 GitHub Actions 失败的 desktop 验证：Linux stateful integration 通过 Xvfb 启动 Electron，并在 Turborepo strict env mode 下用 `test:integration.passThroughEnv` 同时传入 `DISPLAY` 与 X11 鉴权所需的 `XAUTHORITY`；Squirrel.Windows 提供必填 NuGet authors/description；macOS 真实主进程 fixture 使用测试侧临时 app root 装配最小 Forge renderer、preload、图标和隔离 profile，不再依赖 clean runner 中不存在的 `.webpack/renderer`；macOS `BrowserWindow` 不接收仅 Windows 使用的开发态 `.ico` 路径；ASAR 审计在 Windows 上以原生分隔符读取条目；CI/release actions 使用 Node 24 runtime。为启动失败清理、嵌套 ASAR 遍历、Xvfb 环境透传和 CI workflow 契约补充回归覆盖，将不需要 Electron 的 lifecycle test 移出真实主进程 hooks，并让 Electron teardown 在短暂优雅退出失败后终止测试子进程（FR-011、FR-023、SC-012、SC-013）。

**Checkpoint**: 审计发现的本地实现与 release-verifier 缺口已关闭；T071-T075 仍为未开始的唯一 operational release closing 路径，任何 server deploy、preview artifact、manifest/hash 或分发继续保持暂停。

---

## Phase 13: Final Operational Internal-Preview Release Closing

**Purpose**: 全部代码、配置与平台扩展完成后，才进入不可逆的 source commit、既有 server deploy、生产验证和受控内部预览证据链。此阶段不再扩展功能；任一 gate 未通过时保持 preview 分发暂停。

- [ ] T071 在不混入无关工作树变更的前提下，创建 v0.5.0 的不可变 source commit，并通过既有 GitHub Actions Release (TCR) 或 Local PowerShell Ops -> TCR -> server 路径部署同一 commit；不得创建第三条 deploy route 或读取/输出生产 secret（FR-002、FR-011、FR-013；missing）。
- [ ] T072 在 fixed production Origin 对 T071 的同一 candidate 运行 `/srv/ai-mind/scripts/verify-production.sh`，传入严格 semver `AI_MIND_DESKTOP_CANDIDATE_VERSION=0.5.0`；记录脱敏 API/CSP/header 结果。未通过时保持 preview 分发暂停（FR-013、SC-011、plan: server-first release order；missing）。
- [ ] T073 仅在 T072 通过后，对同一 source commit 生成 Windows x64 unsigned internal-preview installer、`desktop-release.json` 与 SHA-256，并完成实际 package/fuse audit；不得在 CI 中上传、命名或分发此预览制品（FR-001、FR-011、FR-012、SC-011；missing）。
- [ ] T074 仅使用 T073 的制品完成 Windows x64 fresh-install、same-product overlay-install 与 `startup-smoke.md` 的完整手工矩阵；将脱敏环境、兼容性、启动时长、profile continuity 与安全拒绝结果记入 `acceptance.md`（US1-US6、SC-001、SC-003、SC-007、SC-011；missing）。
- [ ] T075 完成 PP-00 至 PP-11 的学习暂停复核、更新验收台账和角色 sign-off；只有所有 release gate 均为 Pass 时才将 v0.5.0 标记为内部预览可验收（plan: release closing；missing）。
