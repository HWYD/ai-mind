export class OutboundSecretDeniedError extends Error {
    readonly code = 'OUTBOUND_SECRET_DENIED'

    constructor() {
        super('请求包含禁止外发的凭据。')
        this.name = 'OutboundSecretDeniedError'
    }
}

export type OutboundSecretGuardOptions = {
    knownSecrets?: Iterable<string>
}

const credentialPatterns = [
    /\bauthorization\s*[:=]\s*(?:bearer|basic)?\s*[a-z0-9._~+/-]{8,}\b/i,
    /\b(?:bearer|basic)\s+[a-z0-9._~+/-]{8,}\b/i,
    /\b(?:set-)?cookie\s*[:=]\s*[^\s;,]+/i,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?(?:id|token|cookie))\s*[:=]\s*[^\s,;&]+/i,
    /\bsk-[a-z0-9_-]{8,}\b/i,
    /\beyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+\b/i,
]

// 过短的 secret 用子串匹配会大量误杀普通文本，设置最小长度避免误伤。
const minKnownSecretMatchLength = 8

function hasKnownSecretAtWordBoundary(value: string, secret: string) {
    let offset = value.indexOf(secret)
    while (offset !== -1) {
        const before = value[offset - 1]
        const after = value[offset + secret.length]
        if ((!before || !/[\p{L}\p{N}_]/u.test(before)) && (!after || !/[\p{L}\p{N}_]/u.test(after))) {
            return true
        }
        offset = value.indexOf(secret, offset + secret.length)
    }

    return false
}

export function assertOutboundDataAllowed(value: string, options: OutboundSecretGuardOptions = {}): void {
    const normalized = value.trim()
    if (credentialPatterns.some(pattern => pattern.test(normalized))) {
        throw new OutboundSecretDeniedError()
    }

    for (const secret of options.knownSecrets ?? []) {
        const normalizedSecret = secret.trim()
        if (normalizedSecret.length < minKnownSecretMatchLength) {
            continue
        }
        if (hasKnownSecretAtWordBoundary(normalized, normalizedSecret)) {
            throw new OutboundSecretDeniedError()
        }
    }
}
