# Contract：Desktop Public Beta Release

## Purpose

定义 `Unsigned Experimental Preview（未签名实验性预览版）` 的公开 GitHub Pre-release 资产契约。

## Required assets

- `AI-Mind-Desktop-win32-x64-Setup.exe`
- `AI-Mind-Desktop-darwin-arm64.dmg`
- `desktop-release-win32-x64.json` 与 `desktop-release-darwin-arm64.json`，以及对应的 `.sha256` 文件
- `README.md`、`INSTALL-WINDOWS.md`、`INSTALL-MACOS.md`

## Manifest invariants

manifest 必须通过 `distribution: "public-beta"`、`signing: "unsigned"`、`win32-x64`/`darwin-arm64` 平台、固定生产 Origin、严格 semver、完整 source commit 和匹配安装包的 SHA-256 校验。

## Workflow invariants

- 触发方式只能是 `workflow_dispatch`。
- 发布 job 必须要求 `production_verified == 'true'`。
- Workflow 可以构建、审计、传递和发布资产，但不得执行生产部署、SSH、读取生产 secret 或改变普通 PR/Push CI。
- 发布必须使用公开 GitHub Pre-release 并设置 prerelease 标记。

## User-visible warnings

Release 标题/说明和两个平台安装说明必须写明 `Unsigned Experimental Preview`、在线运行、无自动更新和支持架构。Windows 说明 SmartScreen 的“更多信息 → 仍要运行”；macOS 说明 Finder Control-click → Open 的 Gatekeeper 流程。
