# Contract: Desktop Internal Preview Release

**Feature**: v0.5.0 Electron Desktop Host  
**Status**: Implemented release contract; operational evidence pending

## Scope

此契约适用于 Windows x64 与 macOS arm64 的 v0.5.0 未签名内部预览。Windows 产出 Squirrel 安装包，macOS 产出 DMG；制品必须标记“内部预览、未签名、不得公开分发”；它不是公开 release，也不启用自动更新、Apple Developer ID 签名或 notarization。macOS 为保留 Electron fuses 而进行的 ad-hoc 重签名不构成发布者签名。

## Responsibilities and Audit Record

- **Version owner** 批准 Trusted Origin、product identity、release metadata 或本契约的边界变更，并确认同一 canonical spec 工作区已同步。
- **Server deploy operator** 只通过既有两条正式 server deploy route 发布和验证 compatibility API/document headers，并记录候选 commit 与脱敏结果。
- **Internal preview distributor** 只能在 server-first gate 通过后分发同一 commit 的 installer、`desktop-release.json`、SHA-256 和内部渠道说明；“暂停分发”指撤下该候选的受控可获得性并记录 artifact hash、影响范围、原因和时间。
- **受控内部渠道** 指仅项目指定内部测试人员可访问的交付位置。每份候选交付记录必须关联 version owner、deploy operator、distributor、source commit、installer filename、manifest、SHA-256 与内部预览说明，不包含用户资料、cookie 或 secret。

## Required Order

1. 经项目既有的两条正式 server deploy route 发布 webapp 的 compatibility API 和 document security headers；不得为 desktop 新增第三条 server deploy route。
2. 在固定 production Origin `https://ai.hwyblog.cloud` 上，以候选 `X-AI-Mind-Desktop-Version` 做生产验证：compatibility API 返回预期 strict v1 JSON、`Cache-Control: no-store`、不读写 cookie；`/` 与 `/instant-mind` 均有预期 nonce CSP 和安全 headers。
3. 仅当第 2 步全部成功，Windows/macOS CI 才可将同一候选版本的 preview artifact 标为可分发；再分别生成/校验 `win32-x64` 与 `darwin-arm64` 的 `desktop-release.json` 与 SHA-256，并将两者通过受控内部渠道交付。
4. 内部测试人员人工下载、核对 SHA-256、在对应平台安装或覆盖安装；macOS 首次运行按说明完成 Gatekeeper 人工打开后，应用重新走 compatibility check。任何失败都显示本地 recovery，不下载、不跳转外部升级地址。

## Candidate Evidence

每个候选须保存以下不含用户资料的证据：

- Windows x64 与 macOS arm64 构建日志、锁定依赖安装结果与对应 desktop CI 结果；
- 实际 artifact 的 SHA-256、`desktop-release.json`、source commit、internal-preview/unsigned 标签；
- 实际 fuse 验证结果，而不只是一份源配置；该结果必须拒绝启用 `LoadBrowserProcessSpecificV8Snapshot`，因为 Electron 43 制品没有它要求的 `browser_v8_context_snapshot.bin`；
- 实际 packaged app 的 ASAR entry audit：枚举每个 `app.asar` 内部条目，并拒绝 `.env`、私钥、签名凭据和禁止的 release content；
- 已打包 Windows 应用、`Setup.exe`/`Update.exe` 与 macOS `.app` 的 AI Mind 图标可见性结果；图标必须来自包内资产，不得依赖安装时远程下载；
- fixed Origin 的 API 与 document header 验证结果；
- fresh install 与 same-product overlay install 的 smoke 结果，确认 profile 保留。

## Rollback Rule

- 当某一平台 preview artifact 仍在受控内部渠道可获得时，生产服务不得回退到没有 compatibility API 或 document security headers 的版本。
- 必须进行此类 server rollback 时，先暂停相应 preview artifact 的分发并记录影响范围；已安装 desktop 自然 fail closed 到 local recovery。
- 不允许为“旧包还能工作”加入客户端 Origin fallback、HTTP fallback、兼容 response 宽松解析或远程升级 URL。

## Implementation Record

- CI may run non-distributable Windows `make:windows` and fuse/package verification, but
  it must not run `preview:make`, upload an artifact, or receive production secrets.
- `deploy/scripts/verify-production.sh` requires a strict-semver
  `AI_MIND_DESKTOP_CANDIDATE_VERSION` and verifies the fixed-origin API/header boundary
  before any preview artifact step. Its document CSP check accepts exactly
  `style-src 'self' 'unsafe-inline'` and rejects style nonce/hash plus `style-src-attr`.
- Production probe on 2026-08-05 for candidate `0.5.0` returned `404` from
  `/api/desktop/compatibility`; `/` and `/instant-mind` also lacked the required v0.5.0
  document security headers. The server-first gate is therefore not satisfied and no
  preview installer, manifest, hash, or distribution evidence has been created.
