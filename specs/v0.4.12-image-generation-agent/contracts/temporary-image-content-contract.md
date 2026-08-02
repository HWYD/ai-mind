# Contract: Temporary Image Content

## Endpoint

```http
GET /api/chat/runs/{runId}/image
```

The endpoint is same-origin and uses the existing browser session cookie. It never accepts a provider URL from the client.

## Authorization and State Checks

1. Validate `runId` format.
2. Resolve current session and derive `ownerSessionHash`.
3. Load `StreamRun` and `ImageGenerationRun`.
4. Require ownership match.
5. Require:
    - StreamRun terminal `completed`
    - ImageGenerationRun `completed`
    - provider result `ready`
    - no cancel intent/cancelled status
    - current time is before the non-null `providerResultExpiresAt`
6. Read server-private provider URL.

Status/error mapping:

| HTTP | Code                            | Meaning                          |
| ---- | ------------------------------- | -------------------------------- |
| 400  | `IMAGE_RESULT_REQUEST_INVALID`  | Invalid run ID                   |
| 403  | `IMAGE_RESULT_FORBIDDEN`        | Run belongs to another session   |
| 404  | `IMAGE_RESULT_NOT_FOUND`        | Run/result absent                |
| 409  | `IMAGE_RESULT_NOT_READY`        | Run is active or not publishable |
| 410  | `IMAGE_RESULT_EXPIRED`          | Temporary result expired         |
| 502  | `IMAGE_PROVIDER_RESULT_INVALID` | Unsafe/invalid provider content  |
| 504  | `IMAGE_RESULT_FETCH_TIMEOUT`    | Bounded upstream read timed out  |

Error responses are strict JSON. Success returns image bytes.

Public message/action mapping is fixed:

| Code                            | Public message       | Action                         |
| ------------------------------- | -------------------- | ------------------------------ |
| `IMAGE_RESULT_FORBIDDEN`        | 该图片不属于当前会话 | 不提供重试或 URL               |
| `IMAGE_RESULT_NOT_FOUND`        | 图片结果不存在       | 重新发起 `/image`              |
| `IMAGE_RESULT_NOT_READY`        | 图片仍在处理中       | 查看当前任务阶段或停止当前任务 |
| `IMAGE_RESULT_EXPIRED`          | 临时图片已过期       | 重新发起 `/image`              |
| `IMAGE_PROVIDER_RESULT_INVALID` | 图片结果无法安全读取 | 重新发起 `/image`              |
| `IMAGE_RESULT_FETCH_TIMEOUT`    | 图片读取超时         | 重新发起 `/image`              |

## SSRF and Upstream Fetch Rules

Before fetch:

- scheme exactly `https:`
- no username/password
- no fragment
- no custom port
- hostname is a configured exact allowlist derived from real Seedream responses
- hostname cannot be an IP literal
- no user-controlled URL

Fetch:

- `redirect: manual`
- reject all 3xx in v0.4.12
- explicit 15-second timeout and request AbortSignal
- reject non-2xx
- precheck `Content-Length` if present
- reject declared or actual bytes above 20 MiB and read into a bounded 20 MiB memory buffer
- do not write filesystem or database bytes

Validation before response:

- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`
- magic bytes must match the final MIME
- actual byte length must be within hard limit
- empty bodies rejected

The accepted MIME set is exactly `image/jpeg`, `image/png`, `image/webp`; the hard byte limit is 20 MiB and the upstream timeout is 15 seconds. T003 confirms that normal Seedream output fits these bounds; a result outside them is rejected rather than relaxing limits at runtime.

## Trusted Host Allowlist Change Control

### T055 release-regression smoke (2026-08-01)

- The fixed Provider again returned the approved exact host
  `ark-acg-cn-beijing.tos-cn-beijing.volces.com` over HTTPS, without URL
  credentials.
- The temporary content request returned direct HTTP `200` (no redirect),
  `image/jpeg`, and `202,019` bytes. This remains within the fixed 20 MiB
  limit and does not justify relaxing any proxy safety rule.
- The observed sample duration is recorded in the Provider contract. It is a
  single smoke sample, not an SLO percentile and not a browser image-load
  measurement.

- T003 observed `ark-acg-cn-beijing.tos-cn-beijing.volces.com` as the exact
  temporary-result host. This is the initial server-only allowlist entry.
- The smoke observed a direct `200` response (no redirect), `image/jpeg` MIME
  and JPEG magic bytes for all successful samples. Sample sizes were 70,040,
  627,612 and 173,256 bytes, which remain below the fixed 20 MiB limit.
- T003 records the exact HTTPS host names observed from the fixed endpoint. A maintainer copies only those names into the server-only config allowlist together with contract tests.
- The application never learns or persists new hosts from provider responses at runtime.
- A new host is rejected as `IMAGE_PROVIDER_RESULT_INVALID` until a reviewed source change updates the config, this contract, T003/T055 smoke evidence and tests. Such a change may refine the integration but may not change the fixed model or endpoint.

## Success Response

```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Disposition: inline; filename="ai-mind-image-{runId}.{validated-extension}"
Content-Length: <validated bytes>
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

`download=1` is not required. The frontend downloads the already-loaded Blob with its suggested filename, so preview and download do not create separate upstream requests.

`validated-extension` is `jpg`, `png` or `webp` from the validated final MIME. A successful proxy response cannot have an unknown MIME; the browser-side defensive fallback is `.png` only if a platform strips the response type after validation.

## Browser Contract

```text
message completed
→ fetch(contentPath, same-origin)
→ validate response.ok
→ response.blob()
→ URL.createObjectURL(blob)
→ render img and enable download with same object URL
→ revoke on unmount/replace/cancel
```

Rules:

- fetch once per mounted result
- independent AbortController for image fetch
- no Blob/Base64/object URL in local snapshot
- no provider URL in browser network payloads other than the server's own upstream request
- display “临时结果，请及时下载”
- 410/404 becomes “结果已不可用，请重新发起 `/image`”
- cancelled run never renders a late Blob
- image `alt` is built only from public ImageBrief fields; it never contains the internal prompt
- download uses a keyboard-focusable native interaction with an explicit accessible name
- loading/progress and completion use polite status semantics; failures use the existing `Alert` semantics without forcing focus
- expired recovery guidance remains inside the semantic error alert, and the existing stop control remains keyboard-focusable with an explicit accessible name
- an `image-result-ready` card can be replayed only into the original owned assistant message; a browser refresh/local snapshot does not create a new content fetch or promise restoration

## Cache and Retention

- Browser/server response uses `private, no-store`.
- The browser may retain the Blob only for the current mounted component lifetime.
- Every ready result has a server-enforced expiry equal to `min(reliable provider expiry, readyAt + 10 minutes)`. Reads check expiry before selecting or using the URL.
- The repository performs bounded, idempotent cleanup before image-run acquisition and temporary-result lookup: eligible ready rows become `expired` and their provider URLs are nulled atomically.
- No guarantee after refresh, tab close, process restart or provider expiry.

## Security Tests

- cross-session runId returns 403 without bytes
- HTTP URL rejected
- IP literal/custom port/userinfo rejected
- unknown host rejected
- redirects rejected
- oversized Content-Length rejected before body read
- chunked body exceeding actual limit aborted
- fake MIME/wrong magic rejected
- empty/truncated body rejected
- timeout maps safely
- cancelled run and late result never readable
- success returns no provider URL and correct security headers
- expired rows are unreadable before cleanup and have their URL nulled by bounded cleanup
- image/download/status/error states expose the required accessible names and roles
- 20 MiB declared and chunked-body limits and the 15-second timeout map to their distinct public errors
