# Desktop Host 架构

## 范围

v0.5.0 为在线 AI Mind Web 应用提供 Windows x64 与 macOS arm64 Electron 宿主；不打包 Next.js、数据库、模型、MCP、Agent Runtime 或 StreamRun 逻辑。

## 启动边界

```text
应用启动/重试
  -> 单实例锁与持久 profile
  -> Chromium ses.fetch() compatibility 检查
  -> 通过：加载固定 /instant-mind
  -> 失败：进入包内 recovery 页面
```

所有 attempt 共用现有 5 秒预算；TLS、网络、schema、超时和首屏失败均 fail closed。recovery 使用隔离 session，不继承 workspace cookie/cache。

## Renderer 隔离

| 窗口           | 内容                               | 原生能力                             |
| -------------- | ---------------------------------- | ------------------------------------ |
| 工作区         | 固定受信 HTTPS Origin              | 无 preload、IPC、Node 或通用文件 API |
| recovery       | `ai-mind-desktop://local` 包内资源 | 仅 sender 校验后的 recovery IPC      |
| Desktop Chrome | 包内 HTML                          | 仅受限查看/帮助菜单请求              |

导航、弹窗、外链、权限、剪贴板读取和通用下载默认拒绝；受信图像结果由用户主动触发时才打开系统保存对话框。

## 发布边界

Windows 使用 Squirrel，macOS 使用 arm64 DMG。fuse、manifest、SHA-256 和 ASAR 内容审计保持不变。v0.5.0 以 GitHub Pre-release 提供 `Unsigned Experimental Preview`，不提供签名、notarization、自动更新、Intel/universal 或离线模式。

公开发布由独立手动 Workflow 完成，要求维护者先部署并验证服务端；普通 CI 只验证，不上传公开制品。
