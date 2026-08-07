# Contract: Desktop Compatibility API

**Feature**: v0.5.0 Electron Desktop Host  
**Status**: Planned v1 public contract

## Purpose

在 Electron 加载远程工作页面之前，让固定的官方 AI Mind 服务判断当前 Desktop Release 是否仍兼容。它不是登录、配置、更新下载、遥测或环境发现 API。

## Endpoint

```text
GET /api/desktop/compatibility
Accept: application/vnd.ai-mind.desktop-compatibility+json; version=1
X-AI-Mind-Desktop-Version: <strict semver>
```

请求由 desktop profile 的 Chromium session 使用 `credentials: omit` 发出。客户端永远不从 response 读取或接受新的 Origin、升级 URL、cookie、token 或 capability 配置。

## Response

成功响应固定为 `200`, `Content-Type: application/json`, `Cache-Control: no-store`，并且满足 strict schema（未知字段即 contract failure）：

```ts
type DesktopCompatibilityResponseV1 =
    | {
          contractVersion: 1
          status: 'compatible'
      }
    | {
          contractVersion: 1
          status: 'manual_upgrade_required'
          minimumDesktopVersion: string // strict semver
      }
```

Examples:

```json
{ "contractVersion": 1, "status": "compatible" }
```

```json
{
    "contractVersion": 1,
    "status": "manual_upgrade_required",
    "minimumDesktopVersion": "0.5.1"
}
```

## Server Rules

- 当前版本 policy 仅比较桌面 release 的 strict semver 与服务端最小支持 release；没有用户、cookie、DB 或 Agent Runtime 依赖。
- client version 缺失或不合法：返回安全 400 JSON error；Electron 主进程仍统一把它视作 `COMPATIBILITY_CONTRACT_INVALID`，不加载 workspace。
- 未知 release、服务内部异常、非 JSON 或错误 content type：按照现有 API 安全错误规则返回；不输出 stack、配置、secret 或任意 upgrade URL。
- `manual_upgrade_required` 时服务必须仍返回合法 v1 body；不依赖 426/redirect/HTML 页面。
- 当 policy 需要调整时，变更必须随 webapp server 发布并由既有 deployment 事实源执行；不能由客户端 env 或用户输入覆盖。

## Desktop Client Rules

1. 仅允许 build config 的 exact `https:` Origin（开发模式只有显式 local Origin）。
2. 每一次启动、重试或 reset 后的检查都创建一个 5 秒总 deadline。`ses.fetch()`、strict DTO 解析和后续首屏 `loadURL` 共享这一个 budget；兼容性请求只能使用当时剩余时间，不能单独再获得 5 秒。
3. 校验 status、content type、strict JSON、`contractVersion === 1` 和 semver。`manual_upgrade_required.minimumDesktopVersion` 必须存在、是 strict semver 且严格高于当前 Desktop Release；缺失、格式错误或不高于当前版本均为 `COMPATIBILITY_CONTRACT_INVALID`。
4. `compatible` 后才可 `loadURL(trustedOrigin)`。
5. `manual_upgrade_required` 显示 packaged local recovery、minimum version 和“从受控内部渠道获取较新内部预览制品”的说明；v0.5.0 不显示或打开升级 URL。
6. HTTP/network/TLS/timeout/schema 或剩余 deadline 不足以完成首屏加载时均进入 packaged local recovery，绝不 HTTP 回退或忽略证书。
7. 每个异步结果携带发起时的 `attemptId`；只有仍为 current attempt 且未超过 deadline 的结果可创建 workspace，旧请求/旧页面回调一律忽略。

## Compatibility Evolution

- v1 的 response 不允许 silently add fields；扩展时新增 `contractVersion: 2` 和显式 desktop client 支持。
- 旧 desktop 不理解的 version 必须 fail closed 并进入安全恢复状态。
- 自动更新不是这个 API 的职责；v0.5.0 的内部测试用户主动下载/覆盖安装受控渠道提供的未签名预览制品后，应用才重新执行本检查。
