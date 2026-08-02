# Contract: Fixed Seedream Image Provider

**Provider**: Doubao Seedream through Volcengine Agent Plan  
**Model**: `doubao-seedream-5.0-lite`  
**Endpoint**: `https://ark.cn-beijing.volces.com/api/plan/v3/images/generations`

## Configuration

The fixed model and Agent Plan endpoint are defined in the server-only
`apps/webapp/lib/ai/image-provider/image-provider-config.ts` module:

```ts
export const seedreamImageProviderConfig = {
    endpoint: 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations',
    model: 'doubao-seedream-5.0-lite',
} as const
```

They are not environment variables and are not client-overridable.

`AI_MIND_DOUBAO_API_KEY` is the project's existing Doubao server secret and is reused directly. v0.4.12 adds no image-specific Key or environment variable. Model and endpoint are not accepted from request body, composer options, query parameters or model catalog.

Missing Key fails before external invocation with safe `IMAGE_PROVIDER_AUTH_FAILED`.

## Provider Interface

```ts
interface ImageGenerationInput {
    prompt: string
    size: string
}

interface ImageGenerationProviderOptions {
    signal: AbortSignal
}

interface InternalTemporaryImageResult {
    providerRequestId?: string
    providerUrl: string
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
    width?: number
    height?: number
    expiresAt?: string
}

interface ImageGenerationProvider {
    generate(input: ImageGenerationInput, options: ImageGenerationProviderOptions): Promise<InternalTemporaryImageResult>
}
```

## HTTP Request

Target request shape, finalized by the mandatory Agent Plan smoke:

```http
POST /api/plan/v3/images/generations HTTP/1.1
Host: ark.cn-beijing.volces.com
Authorization: Bearer <AI_MIND_DOUBAO_API_KEY>
Content-Type: application/json
Accept: application/json
```

```json
{
    "model": "doubao-seedream-5.0-lite",
    "prompt": "<internal optimized prompt>",
    "size": "<confirmed default>",
    "sequential_image_generation": "disabled",
    "response_format": "url"
}
```

### T003 confirmed integration facts (2026-07-29)

- The fixed model and Agent Plan endpoint accepted a single synchronous request
  with `model`, `prompt`, `size: "2K"`,
  `sequential_image_generation: "disabled"` and `response_format: "url"`.
- A successful response is an object with `model`, `created`, one-item `data`
  and `usage`; the item contains `url` and its actual output `size`.
- The implementation maps `square`, `landscape` and `portrait` ImageBrief
  intents to the one fixed request value `"2K"`. The provider chooses the
  actual dimensions from the prompt: the smoke observed `3136x1344` for a
  landscape description and `1664x2496` for a portrait description.
- The pre-provider local abort probe raised `AbortError`. The adapter must pass
  its run-scoped signal to `fetch` and preserve this local behavior.

### T055 release-regression smoke (2026-08-01)

- The unchanged fixed model/endpoint returned HTTP `200` for one single-image
  request. The response still contained one `data` item with an HTTPS URL, and
  an `x-request-id` header was present.
- The same fixed request fields remain accepted: `model`, internal `prompt`,
  `size: "2K"`, `sequential_image_generation: "disabled"` and
  `response_format: "url"`.
- The provider-to-temporary-content sample completed in `17,842 ms`. This is
  one external integration sample only: it does not include browser Blob load,
  does not establish an end-to-end percentile, and does not change the 120 s
  deterministic acceptance boundary.

Hard rules:

- Exactly one external generation request per accepted image run.
- `prompt` is internal and never logged or returned.
- No automatic retry.
- No reference image, group options, provider prompt optimizer, streaming, tools or unconfirmed parameters.
- `AbortSignal` must be passed to `fetch`.
- Client cannot override any field except the original natural-language description that the Agent transforms before this boundary.
- T003 must record one fixed `size` mapping for each abstract `square`, `landscape`, `portrait` value; unspecified user aspect uses `square`. Until this reviewed mapping is present, the adapter is not implementable and must not guess a Provider size.

## Success Response Validation

The exact Agent Plan schema must be captured from smoke and encoded as a strict adapter schema. Minimum accepted semantics:

- response represents success
- exactly one result
- result contains one HTTPS temporary image URL
- optional size/dimensions are positive and sane
- optional provider request ID is stored only for operational correlation
- unknown fields do not enter domain/public DTO

The adapter returns `InternalTemporaryImageResult`; it does not fetch image bytes and does not emit a stream chunk.

## Error Normalization

| Condition                                       | Domain code                       | Public behavior                          |
| ----------------------------------------------- | --------------------------------- | ---------------------------------------- |
| Input/output safety rejection                   | `IMAGE_PROVIDER_CONTENT_REJECTED` | Ask user to change description; no retry |
| Missing/invalid key, 401/403                    | `IMAGE_PROVIDER_AUTH_FAILED`      | Generic configuration failure            |
| 429/quota/concurrency                           | `IMAGE_PROVIDER_BUSY`             | Ask user to retry as a new request later |
| 5xx/network before known response               | `IMAGE_PROVIDER_UNAVAILABLE`      | Fail current run; no auto retry          |
| Timeout/connection loss with unknown acceptance | `IMAGE_GENERATION_AMBIGUOUS`      | Explicit unknown state; no auto retry    |
| Empty/multiple/non-HTTPS/malformed result       | `IMAGE_PROVIDER_INVALID_RESULT`   | Fail current run                         |
| Aborted signal/cancel intent                    | cancellation                      | Preserve cancelled terminal              |

Raw provider error body, request headers, internal prompt, URL and API Key are server logs forbidden.

## Cancellation Contract

The adapter:

1. checks `signal.aborted` before request;
2. passes signal to HTTP client;
3. throws an abort-classified result if the signal wins.

The coordinator, not the adapter, owns terminal state. After provider return it checks cancel intent before persisting URL. HTTP abort is best-effort and does not imply provider-side generation cancellation.

## Contract Tests

- exact fixed model and endpoint
- request cannot override model/endpoint
- API Key only in Authorization header
- one request maximum
- no retry on network/timeout/5xx/safety failure
- abort signal propagation
- strict single-result parsing
- non-HTTPS, empty and multi-result rejection
- safe error mapping without raw content
- no prompt/URL/key in logs or public chunks

## Mandatory Real Smoke

This contract is discovered and verified twice against the same fixed integration:

- **Pre-implementation gate (T003)**: must complete before the real adapter and temporary-content service begin. It establishes the exact request/response schema, default size, URL host/type/size/expiry facts, and local abort behavior used by implementation.
- **Release regression (T055)**: reruns the safe subset after implementation to detect contract drift. It is not the first discovery point.

Run only with explicit credentialed environment because it invokes a real paid-capability endpoint:

1. basic single image
2. fixed model acceptance
3. confirmed `square` default and `square`/`landscape`/`portrait` Provider size mapping
4. response field and request ID capture
5. safety rejection shape
6. auth/quota error shape where safely reproducible
7. temporary URL host/redirect/type/size/expiry
8. local abort behavior

Smoke results update this contract without changing the fixed model or endpoint.
