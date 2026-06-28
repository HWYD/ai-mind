# Decisions 022：v0.2.2 Baseline

状态：Released Baseline
版本：v0.2.2
归档日期：2026-06-28

## 核心决策

### 1. 部署版本以生产拓扑收口，而不是以本地 Docker 成功为终点

`v0.2.2` 的目标是“真实生产可发布”，所以必须以线上拓扑和真实服务器约束为准。

### 2. registry 选择腾讯云 TCR，而不是继续坚持 GHCR

这不是偏好问题，而是基于服务器访问 GitHub / GHCR 超时后的现实收口。

### 3. PAS 必须保持内网服务，不对公网暴露

`project-assistant-service` 通过 webapp 代理访问即可，不应提供公开入口。

### 4. 宿主机 Nginx 负责 HTTPS termination

证书、反代与公网入口控制都属于宿主机职责，不应下沉进应用仓库运行逻辑。

### 5. 生产真实 env 与机密不进入仓库

仓库只保存 example 与脚本；真实密钥、token、证书在服务器侧管理。

### 6. `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN` 采用 fail-closed 边界

缺失 token 时不允许 PAS 以“无保护模式”继续提供能力，这一点是明确安全约束。

### 7. 生产 Compose 只消费已构建镜像

远端只负责拉取与启动，构建职责留给 CI，减少服务器环境漂移。

## 后续影响

这组决策为后续版本提供了稳定部署地基：

- 应用运行时与生产拓扑边界更清晰
- CI / 镜像 / 服务器职责分层更清晰
- 后续数据库、checkpoint、AgentRun 等生产能力可以叠加在已有交付链路上推进
