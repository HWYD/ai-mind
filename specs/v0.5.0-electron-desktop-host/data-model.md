# Data Model：Public Beta Release

## DesktopPreviewManifest

每个安装包随附的不可变证据文件：

```ts
type DesktopPreviewManifest = {
    desktopVersion: string
    distribution: 'public-beta'
    electronVersion: string
    platform: 'win32-x64' | 'darwin-arm64'
    sha256: string
    signing: 'unsigned'
    sourceCommit: string
    trustedOrigin: 'https://ai.hwyblog.cloud'
}
```

manifest 不包含下载 URL、secret、用户 profile、cookie、telemetry endpoint 或更新配置。

## PublicBetaRelease

一个 tag 和 source commit 对应一个 GitHub Pre-release。资产包括两个安装包、两个 manifest、两个校验文件和安装/说明文档；它不是自动更新源。
