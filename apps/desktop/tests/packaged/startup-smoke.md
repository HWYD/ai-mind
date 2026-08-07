# Desktop Public Beta Fresh-install Smoke

**范围**：公开 GitHub Pre-release 的 `Unsigned Experimental Preview`，由维护者在生产 verifier 通过后执行。

## Windows x64

1. 下载 `AI-Mind-Desktop-win32-x64-Setup.exe` 与对应 manifest/hash。
2. 校验 SHA-256；按 SmartScreen 的“更多信息 → 仍要运行”完成首次安装。
3. 启动后确认 About 显示 `public-beta`、`unsigned` 和固定 Origin。
4. 完成 compatibility、一次普通聊天和 recovery 失败路径检查。

## macOS arm64

1. 下载 `AI-Mind-Desktop-darwin-arm64.dmg` 与对应 manifest/hash，确认平台为 `darwin-arm64`。
2. 校验 SHA-256；若 Gatekeeper 阻止，使用 Finder Control-click 应用并选择“打开”。
3. 确认 Apple Silicon 架构、固定 Origin、一次普通聊天和 recovery 失败路径。

## 共同边界

本 smoke 只保证 fresh install 体验；不承诺自动更新、离线运行、Intel/universal 或公开 overlay upgrade。记录结果时不得包含 cookie、聊天内容、Prompt、secret 或原始错误。
