# Spec 022：Containerized Deployment and GitHub Actions Delivery Baseline

状态：Released Baseline
版本：v0.2.2
归档日期：2026-06-28

## 摘要

本目录用于沉淀 `v0.2.2` 已发布的部署治理基线，而不是重新规划部署方案。

`v0.2.2` 的核心价值不是新增业务功能，而是把 AI Mind 从“本地能跑”推进到“生产部署拓扑、镜像交付链路与运维边界可落地”。

## 版本定位

`v0.2.2` 是部署与交付版本，重点在于：

- 双应用容器化
- 生产 Compose 资产
- GitHub Actions 构建与发布
- 腾讯云生产交付链路验证
- HTTPS / Nginx / 内网服务暴露边界

它不是 Tasklist Agent、Graph、Stream 协议或前端交互的功能扩张版本。

## 已发布系统行为

- 生产交付链路收口为 `GitHub Actions -> Tencent Cloud TCR -> Tencent Cloud server Docker Compose`。
- 宿主机 Nginx 负责 HTTPS 终止，并代理到 `127.0.0.1:3000`。
- `project-assistant-service` 只保留在 Docker 内网，通过 `webapp -> http://project-assistant-service:8788/mcp` 访问。
- 生产 Compose 只消费已构建镜像，不在服务器上二次构建应用。
- `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN` 作为生产 fail-closed 边界，webapp 与 PAS 必须完全一致。
- `docs/`、本地 prompt 资产、stdio MCP 脚本和必要构建产物必须进入运行时镜像。

## 已验证生产状态

根据仓库中的真实 release / deployment 资料，`v0.2.2` 已验证：

- `project-assistant-service` healthy，且仅 `expose 8788`
- `webapp` healthy，且仅绑定 `127.0.0.1:3000 -> 3000`
- `https://ai.hwyblog.cloud` 可访问
- `http://ai.hwyblog.cloud` 会 `301` 跳转到 HTTPS
- `https://ai.hwyblog.cloud/mcp` 返回 `404`，说明 PAS 未经 Nginx 对公网暴露

## 关键环境与发布变量

历史版本资料中已确认的关键变量包括：

- `AI_MIND_WEBAPP_IMAGE`
- `AI_MIND_PROJECT_ASSISTANT_SERVICE_IMAGE`
- `AI_MIND_IMAGE_TAG`
- `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN`

约束：

- 模型 API Key、MCP token、SSL 私钥不进入仓库
- 生产真实 env 只保存在服务器 `env` 目录
- GitHub Actions 不持有模型 API Key 或线上业务密钥

## 非目标

`v0.2.2` 不实现：

- Tasklist Agent 行为变更
- Graph runtime 改造
- durable checkpoint
- HITL
- Run History
- Stream 协议改造
- MCP 对公网暴露
- 服务器在线构建应用
- 将 SSL 私钥或真实生产 env 提交入仓

## 历史资料来源

本 baseline 主要提炼自以下真实仓库资料：

- `docs/versions/v0.2.2-containerized-deployment-and-github-actions-delivery.md`
- `docs/releases/v0.2.2.md`
- `docs/tasklists/v0.2.2-tasklist.md`
- `private-folder/plans/plan-2026-06-14-v0.2.2-containerized-deployment-and-github-actions-delivery.md`
- `private-folder/tasklists/plan-2026-06-14-v0.2.2-containerized-deployment-and-github-actions-delivery-tasklist.md`
