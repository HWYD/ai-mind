# Quickstart：Public Beta Release

## 维护者前置操作

1. 使用现有项目部署路径部署候选 source commit。
2. 对候选版本运行现有生产兼容性/安全响应头 verifier。
3. 确认结果通过后，再手动触发公开发布 Workflow。

## Agent 负责的本地检查

```powershell
pnpm --filter @ai-mind/desktop test:stable
node --test scripts/validate/validate-ci-workflow.test.mjs
pnpm lint
pnpm typecheck
git diff --check
```

## 公开发布

在 GitHub Actions 手动运行 **Desktop public beta release**，填写 source commit 和 release tag，并将 `production_verified` 设为 `true`。Workflow 会构建和审计两个原生制品，然后创建公开 GitHub Pre-release。

## 试用者验证

下载匹配平台的安装包，使用 `desktop-release.json` 比对 SHA-256，阅读平台安装说明并完成一次 fresh-install 普通聊天 smoke。不要把它当作已签名、稳定版、离线版或支持自动更新的产品。
