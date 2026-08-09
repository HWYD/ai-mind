# Contract: Desktop Support Diagnostic

**Feature**: v0.5.0 Electron Desktop Host  
**Status**: Implemented v1 local-only contract; packaged manual acceptance evidence pending

## Purpose

当桌面端进入本地 recovery 状态时，用户可主动生成一段小型、可安全交给支持人员的诊断摘要。它帮助确认“运行的是哪一版、在哪个 Windows/macOS 环境、连接哪个官方 Origin、兼容性检查失败在哪类”，不是 crash dump、会话导出或遥测。

## JSON Shape

```ts
type DesktopSupportDiagnosticV1 = {
    schemaVersion: 1
    generatedAt: string
    desktopRelease: string
    electronVersion: string
    chromiumVersion: string
    platform: 'win32' | 'darwin'
    architecture: 'x64' | 'arm64'
    trustedOrigin: string
    compatibilityState: 'compatible' | 'manual_upgrade_required' | 'unavailable' | 'not_checked'
    safeNetworkErrorCode?:
        | 'COMPATIBILITY_TIMEOUT'
        | 'NETWORK_UNAVAILABLE'
        | 'TLS_VALIDATION_FAILED'
        | 'COMPATIBILITY_HTTP_FAILED'
        | 'COMPATIBILITY_CONTRACT_INVALID'
        | 'PROFILE_UNAVAILABLE'
        | 'LOCAL_RECOVERY_UNAVAILABLE'
        | 'WORKSPACE_LOAD_FAILED'
        | 'WORKSPACE_LOAD_TIMEOUT'
    minimumDesktopVersion?: string
}
```

`minimumDesktopVersion` 仅在 `manual_upgrade_required` 时出现。文本导出是该 JSON 的稳定、可读格式；不另外创造不受测试的字段。

## Explicitly Excluded Data

诊断构造函数只能读取 allowlist，以下数据即使在内存、profile 或网页中存在，也禁止读取/序列化：

- 聊天正文、会话标题、Agent trace、Prompt、图像 bytes/URL；
- cookie、localStorage、IndexedDB、session/user identifier、请求/响应 header；
- API key、数据库/模型/MCP credential、server/internal service config；
- 原始 exception、证书主体、完整网络路径、Windows 用户名、文件路径和选择的 save path；
- telemetry ID、广告/分析 ID 和用户行为数据。

## Creation and Delivery

1. recovery 页显示“复制诊断”与“导出诊断”操作；两者都由用户主动点击。
2. local preload 调用窄 bridge；main process 从当前 `DesktopHostState` 构造 v1 allowlist object。
3. copy 仅写 plain text；export 必须显示 native save dialog，默认建议 `ai-mind-desktop-diagnostic-<release>.txt`。
4. 操作结果只能是 `copied`、`saved`、`cancelled` 或 `failed` 等安全状态；UI 不显示 path 或 raw error。

系统不得自动创建文件、自动发送 HTTP、background upload、crash reporting、analytics 或 retry。用户选择把复制/导出的文本交给谁不在 application 权限范围内。

## Acceptance Requirements

- 单元测试以 allowlist 断言 export/copy 结果包含 required fields。
- 使用含 mock chat/cookie/secret/raw error 的状态验证这些文本均不出现在诊断中。
- 网络 mock 断言生成、copy、export 和失败状态不会发出 upload request。
- sender/window validation 测试证明 remote workspace 不能调用这两个入口。
