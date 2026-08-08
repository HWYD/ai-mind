# Quickstart: AI Mind Desktop Host

**Feature**: v0.5.0 Electron Desktop Host
**Purpose**: 实现与验收指南，不是面向最终用户的安装教程

## 1. Prerequisites

- Node.js `>=22 <23`
- pnpm 10.34.0
- 已可运行的 AI Mind webapp 与其既有开发数据库环境
- Windows x64 与 Apple Silicon macOS arm64 用于 Electron 打包与安装 smoke
- v0.5.0 不配置代码签名；公开 Beta 制品必须标记 `Unsigned Experimental Preview`、`public-beta` 与 `unsigned`，并在 GitHub Pre-release 与 SHA-256 校验信息一起提供

公开 Beta desktop build 的 production Origin（`https://ai.hwyblog.cloud`）和产品 identity 是受版本控制的 build constants。开发时可传入明确的 localhost Origin；此能力必须由 `app.isPackaged === false` 强制隔离，不能出现在公开 Beta 安装包的 UI、配置文件或环境回退中。v0.5.0 不配置或打开升级 URL；升级只由 GitHub Pre-release 人工交付。

桌面端原生菜单、启动/恢复状态、诊断和图像保存等本地界面使用简体中文；错误码、版本号、Origin、分发标识和诊断 JSON 保持原始英文或机器可读值。

## 2. Contract-first Implementation Order

1. 创建 `apps/desktop` workspace、Forge Webpack config、stable product metadata、Windows x64 maker 和 macOS arm64 DMG maker；接入单实例与 Windows-only Squirrel startup event。
2. 实现 `DesktopBuildConfig` 的 public-beta/dev 校验；写入 fuses、公开 Beta 标识与 hash manifest 的生成/验证脚本。
3. 在 webapp 先实现 strict `GET /api/desktop/compatibility` contract 和 policy 测试；它不得读取 session、写 DB 或返回 upgrade URL。先按既有 server deployment 方式将此契约和 headers 部署、验证，再允许创建 GitHub Pre-release 制品。
4. 为 webapp 建立资源 inventory，增加按 document/API/static/prefetch 分路由的 nonce CSP `proxy.ts`、Permissions-Policy 等安全 headers 及回归测试。Web document 与本地 Chrome/recovery 的全部 CSS 使用 `style-src 'self' 'unsafe-inline'`，不保留 style nonce/hash 或 `style-src-attr`，以兼容受控 UI 组件和运行时样式；不得放宽 `script-src`、新增远程样式来源，或将该例外带入 API、静态资源和 ASAR 白名单外资源。
5. 实现 persistent workspace profile、独立 recovery memory session、`ses.fetch()` compatibility client、单一 5 秒总 deadline 和带 `attemptId` 的 desktop host 状态机。
6. 实现 work/recovery 两种窗口；work 无 preload，recovery 使用绑定 memory session 的 internal protocol、最小 preload 和 sender-validated IPC；恢复页只提供 GitHub Pre-release 升级说明，不提供外链。
   Desktop Chrome 继续由独立本地 renderer 承担：Windows 使用浅色 `titleBarStyle: 'hidden'` 和右侧 `titleBarOverlay` 原生控制，macOS 使用 `hiddenInset` 保留左侧 traffic lights。品牌和既有“查看”“帮助”菜单是 `no-drag` 交互区，其下方独立 drag layer 覆盖其余顶栏；成功后固定加载 `<trusted-origin>/instant-mind`。Chrome 和 recovery 的 HTML、JS、CSS 必须是 Forge 实际产物的精确白名单；local CSP 允许 `style-src 'self' 'unsafe-inline'`，但脚本仍只允许 `'self'`。
7. 先完成 Windows external-opening feasibility gate，再实现导航、popup、permission、certificate、external link 与 second-instance policy，并完成 deny-path tests。
8. 实现经确认的 session reset、脱敏 diagnostics copy/export；测试它们不触碰 server data/用户内容。
9. 实现 `will-download` 的 image-only + `DownloadItem.hasUserGesture()` + no-redirect + save-dialog policy，并对现有图像下载与文本复制做 desktop smoke。
10. 补 Windows/macOS CI/test lane、公开 Beta 打包、发布标识/fuse/hash 验证及兼容/不可用/GitHub Pre-release 升级说明/关闭恢复 smoke。
11. 完成 ADR、architecture、version/release/tasklist、README，同步 Spec Kit tasks/analyze/converge 后再做 release closing。

## 3. Development Commands

在实际 package script 落地后，保持下列命令语义。这里的命令名是目标接口；若现有 monorepo script 命名要求调整，必须同步本文件、根脚本与 CI。

```powershell
# 现有线上服务开发栈
pnpm dev:webapp:db

# 另一个终端：默认连接本机开发服务
pnpm --filter @ai-mind/desktop start
# Forge Webpack renderer dev server uses http://localhost:3001; the webapp remains on port 3000.

# desktop 单元/集成验证与不可分发的 Windows/macOS package 检查
pnpm --filter @ai-mind/desktop test:stable
pnpm --filter @ai-mind/desktop make:windows
pnpm --filter @ai-mind/desktop make:macos-arm64

# 仓库门禁
pnpm lint
pnpm typecheck
pnpm test:stable
pnpm build
```

## 4. Server-first Public Beta Procedure

`make:windows` is a non-distributable package check. Do not create a GitHub Pre-release,
manifest/hash, or distribute an installer until the webapp changes are deployed through
one of the two existing server deployment routes and the same candidate version passes the
fixed-origin check:

```bash
AI_MIND_DESKTOP_CANDIDATE_VERSION=0.5.0 \
  /srv/ai-mind/scripts/verify-production.sh
```

Only then may the maintainer manually start the public release workflow for the same
commit. It creates the unsigned Windows x64 and macOS arm64 GitHub Pre-release assets,
platform-specific `desktop-release.json` files, and SHA-256 files, verifies the actual
package fuses, and then requires fresh/overlay-install evidence. macOS first launch may
require the documented Gatekeeper right-click/Open step in Finder; do not disable
Gatekeeper globally or remove quarantine attributes. This does not make the artifact
signed or notarized. If the server rolls back past the compatibility or document-header
contract, pause the matching GitHub Pre-release first. Existing desktop clients must stay
fail-closed; do not add an alternate Origin, HTTP fallback, or upgrade URL.

`start` 与 `dev` 通过 Node 22 原生 `process.loadEnvFile()` 加载可选的 `apps/desktop/.env.local`，并在该文件或 shell 变量均未设置时只为 Forge 开发进程使用 `http://localhost:3000`。从 `apps/desktop/.env.example` 复制该文件后，可将 `AI_MIND_DESKTOP_DEV_ORIGIN` 改为另一 localhost/127.0.0.1 HTTP Origin；shell 变量优先，现有 build config 会拒绝其他值。Electron Forge 本身不自动加载 `.env`。该文件不由 `make`、`preview:make` 或 packaged Electron 读取，不能作为 production Origin override。

不要用 `NODE_TLS_REJECT_UNAUTHORIZED=0`、`--ignore-certificate-errors`、`--no-sandbox`、production URL env override 或任意 Node HTTP client 绕过桌面网络测试。

## 5. Mandatory Automated Verification

| Area                     | Required evidence                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compatibility API        | strict request/response schema、最小支持版本、cache/security header、无 cookie/DB dependency、unknown status fail closed                                                                                                                 |
| Server headers           | nonce 每请求不同、Web document `style-src` 允许 `unsafe-inline` 兼容运行时样式、`script-src` 无 `unsafe-inline`/`unsafe-eval`、API/static/Electron local CSP 不继承该例外、合法 Next/Blob 图像资源可用、设备权限和 frame/object 限制生效 |
| Build config             | packaged build 只能使用固定 HTTPS Origin；dev localhost only；没有 release/upgrade URL、用户环境 Origin 或 runtime override                                                                                                              |
| Window security          | remote window 的 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、无 preload；local bridge 不可被 remote sender 调用                                                                                                    |
| Navigation & permissions | off-origin/redirect/frame/popup 及所有外部打开请求均拒绝；Windows behavior gate 未识别可安全放行的向量，因此不调用系统浏览器；所有未声明 permission、clipboard read、file system/device access 拒绝                                      |
| Failure state            | 从单次 attempt 开始，compat network/TLS/http/schema 和 workspace load 共享 5 秒总时限；过期 callback 不得复活 workspace；retry 仅命中 fixed Origin                                                                                       |
| Profile lifecycle        | restart/覆盖安装保留 profile；confirmed reset 只清本地 trusted profile；失败不调用 server data delete                                                                                                                                    |
| Download & clipboard     | 合法图片必须满足 `DownloadItem.hasUserGesture()`、trusted main frame、单一受信 URL chain 后才展示 save dialog；auto/redirect/off-origin/unsafe scheme/name/MIME 下载被拒绝；文本 copy 在 trusted user activation 下可写，读取被拒绝      |
| Stream lifecycle         | close/crash/sleep/second instance 不调用 cancel；恢复由 webapp StreamRun contract 决定                                                                                                                                                   |
| Diagnostics              | copy/export 字段 allowlist、无敏感信息、无上传请求；导出取消/失败有安全结果                                                                                                                                                              |
| Public Beta artifact     | Windows x64 与 macOS arm64、`Unsigned Experimental Preview`、`public-beta`、`unsigned` 标识、fuse 状态、hash manifest 与 artifact 一致；不生成 Intel/universal 制品，制品仅作为 GitHub Pre-release 提供                                  |

## 6. Manual Windows/macOS Acceptance Matrix

| Case                                           | Expected result                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh install + normal network                 | Windows x64 在 SC-001 的 10 秒目标内进入独立工作窗口并完成普通流式聊天；macOS arm64 进入独立工作窗口或安全 recovery，并按 Gatekeeper 说明操作                                        |
| Existing features                              | 图像生成、保存图像、受控 Agent、会话列表与 stream recovery 与网页端语义一致                                                                                                          |
| Close/reopen                                   | 同一 Windows/macOS 用户 profile 保留，服务端只显示该 session 有权访问的数据                                                                                                          |
| Second app launch                              | 不产生第二个业务窗口，已有窗口得到聚焦                                                                                                                                               |
| Network offline / DNS / TLS failure            | 5 秒内看到包内失败页；重试不接受忽略证书或 HTTP 回退                                                                                                                                 |
| Server returns manual upgrade                  | 不加载 workspace；显示当前版本、最低版本和 GitHub Pre-release 升级说明，不提供应用内升级链接                                                                                         |
| Manual overlay install newer public beta build | 保留同一平台/产品 profile；重新启动后可用的会话持续可见                                                                                                                              |
| Confirm local reset                            | 本地 cookie/cache/local data 被清；服务端会话/记忆未被删除                                                                                                                           |
| External link                                  | Windows behavior gate 不能稳定辨识真实用户外链；所有 `target=_blank`、`window.open`、form、自动、`file:`、`data:`、`javascript:` 与 custom scheme 请求均不打开，系统浏览器也不会启动 |
| Permissions/download                           | 非声明权限、clipboard read、自动下载全部失败；用户点击当前受信图像可看到系统保存对话框                                                                                               |
| Diagnostic                                     | 本机复制/导出含版本、平台/架构、Origin、compatibility 与 safe code；无聊天、cookie、Prompt、key；无网络上传                                                                          |

### Local CSS Policy Update

The earlier Web-only CSS wording is superseded. Web documents and packaged local Chrome/recovery
documents use `style-src 'self' 'unsafe-inline'`; local scripts remain `script-src 'self'` with
no `unsafe-eval`, and the ASAR resource allowlist remains unchanged. The local renderer webpack
config uses `devtool: 'source-map'`, not Forge's development `eval-source-map` default; restart
the Forge development process after changing this configuration.

## 7. Release Closing

- 执行 `speckit-tasks`、`speckit-analyze`、实现、审计与 `speckit-converge`。
- 确认 Electron 与 Forge 使用当前仍受支持的安全版本，并记录 Electron 支持的最低 Windows/macOS 版本；升级记录进入发布说明。
- 不接入 Windows Authenticode、Apple Developer ID signing 或 notarization；macOS fuse 修改后仅允许 ad-hoc `codesign --sign -` 完整性步骤。用独立命令验证公开 Beta 标识、fuses、artifact hash 和平台化 `desktop-release.json`。
- 服务器端 compatibility/header 改动仅通过既有生产部署路径发布；在固定 production Origin 验证候选桌面版本的 compatibility response、无 cookie 副作用、`/` 与 `/instant-mind` 的 CSP/security headers 后，才可以创建对应 GitHub Pre-release；不要为 desktop 引入新的 server deploy route。
- 若需将 server 回退到不含 compatibility API 或 document security headers 的版本，先暂停对应 GitHub Pre-release；已安装客户端保持 fail closed，不增加 fallback。
- 确认公开 Beta 安装包没有 secret、dev Origin、代理/TLS bypass、auto-update、telemetry endpoint、通用 native IPC，且带有未签名 `Unsigned Experimental Preview` 标识。
- 更新 `docs/adr/0017-secure-electron-desktop-host.md`、`docs/architecture/desktop-host.md`、版本/发布/任务清单和 README。
- 后续正式签名版本收口时才更新根 package version 与 `project-agent-config.yaml`（若存在）。
