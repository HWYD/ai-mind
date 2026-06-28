# Acceptance 022：v0.2.2 Baseline

状态：Released Baseline
版本：v0.2.2
归档日期：2026-06-28

## 镜像与 Compose 验收

- `webapp` 与 `project-assistant-service` 都有可运行镜像
- 运行时镜像包含应用所需文档与本地资产
- 生产 Compose 通过镜像运行，而不是在服务器上重新构建
- `webapp` 依赖 PAS healthy 后再启动

## 网络边界验收

- `webapp` 只通过宿主机 `127.0.0.1:3000` 对 Nginx 开放
- `project-assistant-service` 不映射宿主机端口
- 生产公网入口没有直接暴露 `/mcp`
- 宿主机 Nginx 负责 HTTPS termination

## 安全与 env 验收

- 仓库中不存在真实生产 env、SSL 私钥或业务 token
- `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN` 缺失时 fail closed
- webapp 与 PAS 的 token 配置必须一致

## 真实生产状态验收

- `https://ai.hwyblog.cloud` 正常访问
- `http://ai.hwyblog.cloud` 自动跳转到 HTTPS
- `https://ai.hwyblog.cloud/mcp` 返回 `404`
- `webapp` 和 `project-assistant-service` 容器健康

## CI / 发布验收

- GitHub Actions 能构建双镜像
- GitHub Actions 能推送到腾讯云 TCR
- GitHub Actions 能通过 SSH 触发远端部署

## 已知补验项

根据历史任务资产，以下内容未在 `v0.2.2` 内完全收口：

- 更系统的回滚演练
- 更完整的生产 smoke 证据
- 证书续期与宿主机运维手册

这些属于后续治理与运维完善项，不构成本 baseline 已发布事实失效。
