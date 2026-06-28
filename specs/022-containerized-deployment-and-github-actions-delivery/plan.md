# Plan 022：v0.2.2 Released Deployment Topology

状态：Released Baseline
版本：v0.2.2
归档日期：2026-06-28

## 目的

记录 `v0.2.2` 已经验证过的生产拓扑、交付链路与部署边界，作为后续部署演进的基线。

## 生产拓扑

`v0.2.2` 已发布的生产链路为：

```text
GitHub Actions
  -> build webapp image
  -> build project-assistant-service image
  -> push to Tencent Cloud TCR
  -> SSH to production server
  -> sync deploy assets
  -> docker compose pull
  -> docker compose up -d

Internet
  -> Host Nginx (HTTPS termination)
  -> 127.0.0.1:3000
  -> webapp container
  -> http://project-assistant-service:8788/mcp
  -> project-assistant-service container (internal only)
```

## 应用边界

### webapp

- 对公网服务
- 只由宿主机 Nginx 反代进入
- 容器端口绑定到宿主机 `127.0.0.1:3000`
- 负责访问内网 PAS MCP 入口

### project-assistant-service

- 不对公网暴露
- 只通过 Docker 内网被 webapp 访问
- 仅 `expose 8788`
- 依赖 MCP token 与 webapp 双端一致

## 镜像与运行时资产

`v0.2.2` 的部署计划要求镜像内包含：

- 应用运行时代码
- `docs/`
- prompt 相关本地资产
- stdio MCP 脚本
- `@ai-mind/stream-core` 等必要构建产物

同时要求：

- 生产 Compose 使用 registry 中的不可变镜像 tag / sha
- 服务器不承担应用 build 责任
- 时区明确为 `Asia/Shanghai`

## 生产 env 与安全边界

生产 env 规划在当时收口为：

- 仓库仅保留 `*.production.env.example`
- 真实值仅放在服务器目录
- GitHub Actions 负责交付动作，不保管真实业务机密
- SSL 证书与私钥由宿主机侧管理，不进入仓库

特别约束：

- `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN` 缺失时应 fail closed
- webapp 与 PAS 必须使用相同 token

## 真实交付中的调整

`v0.2.2` 的真实上线并非完全照初稿执行，而是经过了两处重要现实收口：

- registry 从 GHCR 调整为腾讯云 TCR，因为服务器访问 GitHub / GHCR 超时
- HTTPS 从 Certbot-only 设想调整为宿主机证书管理 / 腾讯云 SSL 证书部署，因为 ACME 路径超时

这两点属于历史事实，应作为后续部署方案评估时的前置背景。

## 关联资料

- `docs/versions/v0.2.2-containerized-deployment-and-github-actions-delivery.md`
- `docs/releases/v0.2.2.md`
- `docs/tasklists/v0.2.2-tasklist.md`
- `private-folder/plans/plan-2026-06-14-v0.2.2-containerized-deployment-and-github-actions-delivery.md`
- `private-folder/tasklists/plan-2026-06-14-v0.2.2-containerized-deployment-and-github-actions-delivery-tasklist.md`
