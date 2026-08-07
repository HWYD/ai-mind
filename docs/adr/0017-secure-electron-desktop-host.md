# ADR-0017：安全的 Electron 桌面宿主与公开 Beta

**状态**：已接受，用于 v0.5.0 `Unsigned Experimental Preview`

## 背景

AI Mind 需要 Windows x64 和 Apple Silicon macOS 的桌面入口，但不能复制 Web 应用、AI Runtime、数据层、Tool、Skill、MCP、Agent 或 StreamRun。远程服务不可用或不兼容时，宿主必须 fail closed。

## 决策

- 使用 Electron Forge，仅允许构建时固定的生产 HTTPS Origin；未打包开发模式才允许显式 localhost。
- 远程 workspace 使用 sandbox、context isolation、禁用 Node integration、无 preload/通用 IPC bridge；本地 recovery 才使用受限 preload。
- 保留 compatibility gate、5 秒 attempt budget、持久 profile、隔离 recovery session、deny-by-default 导航/弹窗/权限/下载策略和现有 fuse baseline。
- Windows x64 生成 Squirrel，macOS arm64 生成 DMG；两者以 GitHub Pre-release 公开提供，但均标记未签名实验性预览。macOS fuse 修改后的 ad-hoc re-sign 不代表 Developer ID 签名。
- 公开发布由独立手动 Workflow 完成，必须由维护者先部署并验证服务端；Workflow 不执行部署、不读取生产 secret。

## 结果

桌面进程只承担宿主边界与本地安全能力，Web 应用仍是聊天、图像、Agent、会话和 Stream recovery 的事实来源。v0.5.0 不提供离线 AI、可编辑服务地址、代码签名、自动更新、诊断上传或通用原生 API。
