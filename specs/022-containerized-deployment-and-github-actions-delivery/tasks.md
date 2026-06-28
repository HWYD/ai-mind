# 任务 022：v0.2.2 Completed Baseline

状态：Completed Baseline
版本：v0.2.2
归档日期：2026-06-28

## P0 双应用容器化

- [x] 为 `webapp` 提供生产可运行 Docker 镜像
- [x] 为 `project-assistant-service` 提供生产可运行 Docker 镜像
- [x] 确认镜像内包含 `docs/`、prompt 资产、MCP 脚本和必要构建产物
- [x] 补齐本地 compose 与 env example 资产

## P1 生产 Compose 与宿主机边界

- [x] 产出生产 `docker-compose` 资产
- [x] 将 `webapp` 收口为仅绑定 `127.0.0.1:3000`
- [x] 将 `project-assistant-service` 收口为只在容器内网 `expose 8788`
- [x] 明确 host Nginx 为 HTTPS termination 入口
- [x] 为 `/api/chat` 等流式路径保留 Nginx 代理配置
- [x] 确保公网 `/mcp` 不直透到 PAS

## P2 生产 env 与机密治理

- [x] 仅保留 `*.production.env.example`
- [x] 真实生产 env 留在服务器目录
- [x] 明确 GitHub Actions 不持有模型 API Key / MCP token / SSL 私钥
- [x] 引入并校验 `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN`
- [x] 明确 webapp 与 PAS 的 token 必须完全一致

## P3 GitHub Actions 发布链路

- [x] 建立双镜像构建与推送流程
- [x] 根据真实环境把 registry 收口到腾讯云 TCR
- [x] 建立 SSH 同步部署资产与远端执行部署脚本流程
- [x] 让生产 Compose 只消费镜像，不在远端构建应用

## P4 真实生产验证

- [x] 在腾讯云生产机完成首轮上线验证
- [x] 验证 webapp 与 PAS 容器健康状态
- [x] 验证站点 HTTPS 可访问
- [x] 验证 HTTP 自动跳转 HTTPS
- [x] 验证公网 `/mcp` 返回 404
- [x] 更新版本文档、release 与 tasklist 资产
- [ ] 更完整的回滚演练与长期运维手册在本版后续补齐

## 基线结论

后续如果调整部署链路，不应忽略 `v0.2.2` 已确认的两条现实约束：

- 生产 registry 以可达性为先，GHCR 曾因网络限制被放弃
- 证书管理应尊重宿主机与云服务现实，不应假设 ACME 一定可用
