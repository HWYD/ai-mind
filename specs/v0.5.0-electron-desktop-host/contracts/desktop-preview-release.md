# Contract: Desktop Public Beta Release

**Feature**: v0.5.0 Electron Desktop Host
**Status**: 公开发布 Workflow 已实现；运营证据待维护者完成

## Scope

此契约适用于 Windows x64 与 macOS arm64 的 v0.5.0 `Unsigned Experimental Preview`。Windows 产出 Squirrel 安装包，macOS 产出 DMG；制品通过公开 GitHub Pre-release 提供，均为未签名且不启用自动更新、Apple Developer ID 签名或 notarization。macOS 为保留 Electron fuses 而进行的 ad-hoc 重签名不构成发布者签名。

## Responsibilities and Audit Record

- **Version owner** 批准 Trusted Origin、product identity、release metadata 或本契约的边界变更，并确认同一 canonical spec 工作区已同步。
- **Server deploy operator** 只通过既有两条正式 server deploy route 发布和验证 compatibility API/document headers，并记录候选 commit 与脱敏结果。
- **Public Beta publisher** 只能在 server-first gate 通过后，手动触发同一 commit 的发布 Workflow，创建公开 GitHub Pre-release 并上传安装器、平台 manifest、SHA-256 和安装说明。
- 每份公开交付记录必须关联 version owner、deploy operator、publisher、source commit、Release tag、installer filename、manifest 与 SHA-256；不得包含用户资料、cookie 或 secret。

## Required Order

1. 经既有两条正式 server deploy route 发布 webapp 的 compatibility API 和 document security headers；不得为 desktop 新增第三条 server deploy route。
2. 在固定 production Origin `https://ai.hwyblog.cloud` 上，以候选 `X-AI-Mind-Desktop-Version` 运行 production verifier，确认 strict v1 JSON、`Cache-Control: no-store`、无 cookie 副作用和 `/`、`/instant-mind` 的 CSP/security headers。
3. 仅当第 2 步成功，维护者才能以同一完整 source commit、release tag 与 `production_verified=true` 手动触发 `.github/workflows/desktop-public-preview.yml`。
4. Workflow 在 Windows/macOS 原生 runner 构建、审计并发布 `win32-x64`/`darwin-arm64` 安装包、平台化 manifest 与 SHA-256。
5. 维护者完成双平台 fresh-install smoke；macOS 首次运行按说明完成 Gatekeeper 的 Finder Control-click → Open 流程。任何失败都显示本地 recovery，不下载、不跳转外部升级地址。

## Candidate Evidence

每个候选须保存以下不含用户资料的证据：

- Windows x64 与 macOS arm64 的构建/审计结果；
- 实际 artifact 的 SHA-256、平台 manifest、source commit、`public-beta`/`unsigned` 标记和公开 Release URL；
- 实际 fuse 验证结果；必须拒绝启用 `LoadBrowserProcessSpecificV8Snapshot`，因为 Electron 43 制品没有其要求的 `browser_v8_context_snapshot.bin`；
- 实际 packaged app 的 ASAR entry audit，拒绝 `.env`、私钥、签名凭据和禁止的 release content；
- fixed Origin 的 API/document-header 验证结果；
- Windows x64 与 macOS arm64 fresh-install smoke 结果。

## Rollback Rule

- 当某一平台公开 Beta 制品仍可下载时，生产服务不得回退到没有 compatibility API 或 document security headers 的版本。
- 必须进行此类 server rollback 时，先暂停或撤下相应 GitHub Pre-release；已安装 desktop 自然 fail closed 到 local recovery。
- 不允许为“旧包还能工作”加入客户端 Origin fallback、HTTP fallback、兼容 response 宽松解析或远程升级 URL。

## Implementation Record

- 普通 CI 可运行不可分发的 `make:windows`/`make:macos-arm64` 与 fuse/package 验证，但不得创建公开 Release。
- `deploy/scripts/verify-production.sh` 要求严格 semver `AI_MIND_DESKTOP_CANDIDATE_VERSION`，并在公开制品创建前验证固定 Origin 的 API/header 边界。
- 公开发布 Workflow 不执行部署、不读取 production secret，并把 Release tag 显式指向经过验证的 source commit。
