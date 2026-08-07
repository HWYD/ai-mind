# Feature Specification: AI Mind Desktop Host Public Beta

**Version**：`v0.5.0`
**Feature Branch**：`v0.5.0-next-task`
**Status**：公开 Beta 发布链路实现中

## Product Definition

AI Mind Desktop 是现有 AI Mind 服务的在线 Electron 宿主。v0.5.0 通过公开 GitHub Pre-release 提供 **Unsigned Experimental Preview（未签名实验性预览版）**，让仓库访问者可以下载并体验。

支持的公开制品：

- Windows x64 Squirrel `Setup.exe`
- Apple Silicon（`arm64`）macOS DMG

每次 Release 必须附带平台安装包、`desktop-release.json`、SHA-256 校验文件和安装说明。应用仅在线运行，只加载固定的生产 HTTPS Origin。

## User Scenarios & Testing

### User Story 1 — 下载并体验桌面应用（Priority: P1）

作为仓库访问者，我可以从清晰标记的 GitHub Pre-release 下载适配 Windows x64 或 macOS arm64 的安装包，校验摘要，并在安装前看到未签名警告。

**Acceptance scenarios**：

1. Given 公开 Pre-release 已创建，When 访问者打开 Release，Then 可看到两个平台制品、manifest、SHA-256 文件和安装说明。
2. Given 访问者下载制品，When 将文件 SHA-256 与 manifest/校验文件比较，Then 两者一致。
3. Given 访问者使用不支持的平台，When 阅读 Release 说明，Then 能明确知道不支持 Windows ARM64、macOS Intel/universal、Linux 和自动更新。

### User Story 2 — 在系统保护提示下完成安装（Priority: P1）

作为试用用户，我可以按照简明的 SmartScreen 或 Gatekeeper 指引完成首次启动，并理解这是未签名实验性版本。

**Acceptance scenarios**：

1. Given Windows SmartScreen 提示未知发布者，When 用户选择继续，Then 说明只指导当前应用放行，不要求全局关闭系统保护。
2. Given macOS Gatekeeper 阻止首次启动，When 用户按 Finder 中“右键/Control-click → 打开”操作，Then 可以明确批准本次启动。
3. Given 应用启动时兼容性或网络检查失败，Then 进入包内 recovery 页面，不接受任意服务地址。

### User Story 3 — 使用现有在线 AI Mind 能力（Priority: P1）

作为安装用户，我可以在桌面窗口使用现有聊天、图像、Agent 和会话能力，同时远程页面不能获得本机特权。

**Acceptance scenarios**：

1. Given 固定生产服务兼容，When 应用启动，Then 在桌面窗口打开 `/instant-mind` 工作区。
2. Given 服务不可用、不兼容或 TLS/schema 校验失败，Then 在既有 fail-closed 时限内显示包内 recovery 页面。
3. Given 远程页面尝试导航、弹窗、未授权权限或不安全下载，Then 既有 deny-by-default 策略拒绝请求。

## Functional Requirements

- **FR-001**：公开制品必须通过手动触发的 GitHub Pre-release 发布；普通 push/PR CI 不得上传公开安装包或创建 Release。
- **FR-002**：Workflow 必须从同一个 source commit 构建 Windows x64 与 macOS arm64，并执行现有 package/fuse/ASAR/hash 审计。
- **FR-003**：Workflow 必须要求维护者确认候选版本已经通过既有生产部署与 `verify-production.sh`；Workflow 不得执行生产部署、读取生产 secret 或新增部署路线。
- **FR-004**：每个平台必须提供 manifest，包含完整 source commit、`distribution: "public-beta"`、`signing: "unsigned"`、固定 Origin、平台、版本、Electron 版本和 SHA-256。
- **FR-005**：Release 和平台安装说明必须显著写明 `Unsigned Experimental Preview`、支持平台、在线运行/无自动更新，以及 SmartScreen/Gatekeeper 首次启动方式。
- **FR-006**：每个平台公开前必须完成一次 fresh-install smoke；v0.5.0 不对公开 overlay upgrade 作承诺。
- **FR-007**：不得改变现有固定 Origin、compatibility gate、recovery fail-closed、远程零 bridge、fuse 和包内容审计。
- **FR-008**：公开二进制前必须补充根目录 MIT `LICENSE`。

## Key Entities

- **Public Beta Release**：一个 source commit 对应的 GitHub Pre-release。
- **Desktop Release Manifest**：单个平台安装包的不可变证据文件，不是更新源。
- **Production Verification Confirmation**：维护者在现有部署链路完成验证后提供的人工确认，仅作为 Workflow 输入。

## Success Criteria

- **SC-001**：一次经过授权的运行发布恰好一个 Windows x64 安装包和一个 macOS arm64 DMG，且各自有匹配的 manifest 与 SHA-256 证据。
- **SC-002**：公开发布 Workflow 没有自动触发，也不包含生产部署、SSH、TCR 凭据或生产 secret 访问。
- **SC-003**：现有 PR/Push CI 继续验证 Windows 与原生 macOS arm64 打包，但不发布制品。
- **SC-004**：首次试用者能在两分钟内从 Release 页面找到支持平台、校验方式、未签名状态和系统放行指引。

## Assumptions

- 仓库公开，GitHub Releases 是公开分发渠道。
- 维护者先完成生产部署和验证，再手动触发发布 Workflow。
- fuse 修改后的 macOS ad-hoc 重签名只用于保证本机构建可执行，不构成 Developer ID 签名。

## Non-goals

- Authenticode、Apple Developer ID、notarization、自动更新、遥测、SBOM/provenance、灰度发布和反馈系统。
- Windows ARM64、macOS Intel/universal、Linux、离线 AI Runtime、可编辑 Origin 和新增通用原生 API。
- 从 GitHub Actions 执行生产部署或服务器验证。
