# Acceptance Ledger：AI Mind Desktop Public Beta

**状态**：仓库实现和本地治理检查进行中；生产部署和平台人工 smoke 由维护者负责。

## Scope decision

本版本是公开 GitHub Pre-release，提供未签名 Windows x64 与 macOS arm64 试用安装包，统一标记为 `Unsigned Experimental Preview`，在线运行且无自动更新。

## Evidence matrix

| 门禁                            | 负责人         | 证据                                                         | 状态           |
| ------------------------------- | -------------- | ------------------------------------------------------------ | -------------- |
| Desktop unit tests              | Agent          | `pnpm --filter @ai-mind/desktop test:stable`                 | 已通过         |
| Workflow governance             | Agent          | `node --test scripts/validate/validate-ci-workflow.test.mjs` | 修改后执行     |
| 现有跨平台 CI                   | GitHub         | Windows/macOS arm64 job                                      | 基线已通过     |
| 生产部署                        | 维护者         | v0.5.0 已合并 `main` 并部署最新代码                          | 已完成         |
| 生产兼容性/header 验证          | 维护者         | 既有 `verify-production.sh`                                  | 外部前置条件   |
| Windows fresh-install smoke     | 维护者         | `apps/desktop/tests/packaged/startup-smoke.md`               | 外部前置条件   |
| macOS arm64 fresh-install smoke | 维护者         | `apps/desktop/tests/packaged/startup-smoke.md`               | 外部前置条件   |
| 公开 Pre-release                | Agent Workflow | Release URL、资产、manifest/hash                             | 前置条件完成后 |

## Release acceptance

- 恰好附带两个支持平台的安装包。
- 每个 manifest 的平台、source commit、版本、Origin、distribution、signing 和 SHA-256 与实际资产一致。
- Release 和安装说明写明未签名实验性状态及系统放行方式。
- 不引入生产 secret、部署操作、自动更新 endpoint、telemetry 或不支持架构。

## External-owner handoff

维护者必须先部署并验证候选版本，再手动触发 Workflow 并设置 `production_verified=true`。Agent 不执行、不模拟这些操作，也不会自动合并分支。
