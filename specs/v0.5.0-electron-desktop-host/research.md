# Research：公开未签名实验性预览

## 决策 1：GitHub Pre-release 作为公开渠道

- **选择**：使用手动触发的 GitHub Actions Workflow，并调用 `gh release create --prerelease`。
- **理由**：仓库已经公开，GitHub Release 原生支持双平台资产、校验文件、说明和 Pre-release 标记，不需要新增分发服务。
- **排除**：普通 CI 自动发布、把二进制提交进仓库、新增自动更新服务。

## 决策 2：原生 runner 与现有审计

- **选择**：Windows 使用 `windows-latest`，macOS 使用 `macos-14` 并断言 `arm64`；复用 Forge、fuse、manifest 和 ASAR 审计。
- **理由**：现有 CI 已验证该构建方式，避免交叉架构和路径差异。

## 决策 3：Unsigned Experimental Preview

- **选择**：保留 `signing: unsigned`，机器字段使用 `distribution: public-beta`，所有用户文案使用“Unsigned Experimental Preview（未签名实验性预览版）”。
- **理由**：这是能让用户实际体验的最小路径，暂不引入 Authenticode、Developer ID、notarization 和信誉体系。

## 决策 4：维护者负责生产门禁

- **选择**：Workflow 要求 `production_verified=true`，该值只能在维护者完成既有部署和生产 verifier 后手动提供。
- **理由**：不把服务器凭据和部署逻辑放入桌面发布 Workflow，同时保留 server-first 兼容性安全边界。
