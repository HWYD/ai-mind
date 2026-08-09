# Contract: Web Security Headers

**Feature**: v0.5.0 Electron Desktop Host  
**Status**: Implemented production web contract; fixed-Origin verifier evidence pending

## Purpose

桌面端加载的仍是同一个线上 AI Mind 页面。因此 CSP 和浏览器安全 headers 是 webapp 的生产契约，不是 Electron 专用补丁；普通浏览器与桌面 Chromium 必须得到相同的安全语义。

## Route Scope

`apps/webapp/proxy.ts` 只处理 HTML document 请求，并按**每个 document request**生成新的 nonce：

| Request class                                                    | Nonce proxy | Reason                                                                                     |
| ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `/`、`/instant-mind` 与未来页面 document navigation              | yes         | 需要 CSP nonce，并接受由此带来的 dynamic rendering                                         |
| `/api/**`，包括 `/api/desktop/compatibility`                     | no          | API 保持自身身份、cache 与 response contract；compatibility API 不能被改写为 document 响应 |
| `/_next/static/**`、`/_next/image/**`、favicon/robots 等静态资源 | no          | 保留 Next 静态资源与图片缓存语义                                                           |
| prefetch 请求                                                    | no          | 不为预取生成 nonce 或改变其缓存/性能行为                                                   |

matcher 必须显式实现上表，而非依赖“默认匹配一切”。新增 document 路由时必须纳入 nonce CSP 测试；新增 API/static route 不应被意外转为 dynamic document。

## Document Response Rules

- production document CSP 的 `script-src` 只接受当次 nonce 和 `strict-dynamic`；不得允许 `unsafe-inline`、`unsafe-eval` 或宽泛 wildcard 脚本来源。
- Web document 与包内 Electron local document 的全部 CSS 统一由 `style-src 'self' 'unsafe-inline'` 允许，以兼容受控 UI 组件、Next 开发覆盖层与本地 renderer 的运行时样式。`style-src` 不得含 nonce/hash，也不得设置 `style-src-attr`，否则 Chromium 会忽略 `unsafe-inline`。该例外不得扩展到 `script-src`、API/static 响应、远程样式来源或 Electron local 资源白名单之外。
- `deploy/scripts/verify-production.sh` 必须以大小写无关的 HTTP header name 解析和精确 directive 校验这条 production CSS policy：只接受 `style-src 'self' 'unsafe-inline'`，拒绝 style nonce/hash 和 `style-src-attr`；该校验不能放宽 script CSP 或将 CSS 例外用于非 document 响应。
- CSP 至少含 `object-src 'none'`、`base-uri 'self'`、`frame-ancestors 'none'`，并以现有资源 inventory 定义精确 `default-src`、`img-src`、`style-src`、`font-src`、`connect-src`。`blob:` 只在已验证的图像展示/保存链路所需处允许。
- 同时发送 `Permissions-Policy`（本版未使用的设备/媒体能力禁用）、`Referrer-Policy`、`X-Content-Type-Options: nosniff` 与 frame 防护。不得让 Electron headers 和普通网页 headers 分叉。
- 页面必须通过实际 Next runtime、聊天、图像生成/Blob 展示与必要连接的回归验证。若资源 inventory 变化，先收紧到最小可用 source，再更新本契约和测试。

## Compatibility API Boundary

- `GET /api/desktop/compatibility` 保持其独立 contract：`Cache-Control: no-store`、strict JSON、无身份 cookie、无 nonce 注入。
- 生产部署验证要分别检查 document headers 和 compatibility API headers，不能只检查 status code。
