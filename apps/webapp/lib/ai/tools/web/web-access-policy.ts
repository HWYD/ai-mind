import { isIP } from 'node:net'

import {
    assertOutboundDataAllowed,
    OutboundSecretDeniedError,
    type OutboundSecretGuardOptions,
} from '@/lib/ai/tools/web/outbound-secret-guard'

export class WebAccessPolicyError extends Error {
    readonly code: 'WEB_URL_DENIED' | 'WEB_URL_NOT_AUTHORIZED'

    constructor(code: WebAccessPolicyError['code'], message: string) {
        super(message)
        this.name = 'WebAccessPolicyError'
        this.code = code
    }
}

const credentialQueryNames = new Set([
    'api-key',
    'api_key',
    'apikey',
    'access-token',
    'access_token',
    'authorization',
    'cookie',
    'refresh-token',
    'refresh_token',
    'session',
    'sessionid',
    'token',
])

const cloudFrontSignatureNames = new Set(['key-pair-id', 'policy', 'signature'])

export function canonicalizePublicWebUrl(rawUrl: string, options: OutboundSecretGuardOptions = {}): string {
    try {
        assertOutboundDataAllowed(rawUrl, options)
    } catch (error) {
        if (error instanceof OutboundSecretDeniedError) {
            throw new WebAccessPolicyError('WEB_URL_DENIED', '该链接不可读取。')
        }
        throw error
    }

    let url: URL
    try {
        url = new URL(rawUrl.trim())
    } catch {
        throw new WebAccessPolicyError('WEB_URL_DENIED', '该链接不可读取。')
    }

    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !url.hostname) {
        throw new WebAccessPolicyError('WEB_URL_DENIED', '该链接不可读取。')
    }

    if (isLocalOrPrivateHostname(url.hostname)) {
        throw new WebAccessPolicyError('WEB_URL_DENIED', '该链接不可读取。')
    }

    for (const [name, value] of url.searchParams) {
        const normalizedName = name.toLowerCase()
        if (
            credentialQueryNames.has(normalizedName) ||
            normalizedName.startsWith('x-amz-') ||
            normalizedName.startsWith('x-goog-') ||
            normalizedName === 'sig' ||
            cloudFrontSignatureNames.has(normalizedName)
        ) {
            throw new WebAccessPolicyError('WEB_URL_DENIED', '该链接不可读取。')
        }

        try {
            assertOutboundDataAllowed(value, options)
        } catch (error) {
            if (error instanceof OutboundSecretDeniedError) {
                throw new WebAccessPolicyError('WEB_URL_DENIED', '该链接不可读取。')
            }
            throw error
        }
    }

    url.hash = ''
    return url.toString()
}

const embeddedUrlPattern = /https?:\/\/[^\s<>"')\]]+/gi

// 对自由文本中出现的 http(s) URL 复用 read-url 的 secret/签名/userinfo 策略，
// 防止模型把签名 URL 或凭据拼进 web-search 查询后发送给第三方 provider。
export function assertNoForbiddenWebUrlInText(value: string, options: OutboundSecretGuardOptions = {}): void {
    for (const match of value.matchAll(embeddedUrlPattern)) {
        const candidate = match[0].replace(/[,.;:!?'\])}]+$/, '')
        canonicalizePublicWebUrl(candidate, options)
    }
}

function isLocalOrPrivateHostname(rawHostname: string): boolean {
    const hostname = rawHostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '')
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        return true
    }

    const ipVersion = isIP(hostname)
    if (ipVersion === 4) {
        return isLocalOrPrivateIPv4(hostname)
    }

    if (ipVersion === 6) {
        const embeddedIPv4 = getEmbeddedIPv4(hostname)
        if (embeddedIPv4) {
            return isLocalOrPrivateIPv4(embeddedIPv4)
        }

        return (
            hostname === '::' ||
            hostname === '::1' ||
            hostname.startsWith('fc') ||
            hostname.startsWith('fd') ||
            hostname.startsWith('fe8') ||
            hostname.startsWith('fe9') ||
            hostname.startsWith('fea') ||
            hostname.startsWith('feb') ||
            // ff00::/8 组播地址同样不可作为出站读取目标。
            hostname.startsWith('ff')
        )
    }

    return false
}

function isLocalOrPrivateIPv4(hostname: string): boolean {
    const [first = 0, second = 0] = hostname.split('.').map(Number)
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        first >= 224
    )
}

function getEmbeddedIPv4(hostname: string): string | undefined {
    const groups = expandIPv6Groups(hostname)
    if (!groups) {
        return undefined
    }

    const isCompatible = groups.slice(0, 6).every(group => group === 0)
    const isMapped = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff
    if (!isCompatible && !isMapped) {
        return undefined
    }

    return `${groups[6]! >>> 8}.${groups[6]! & 0xff}.${groups[7]! >>> 8}.${groups[7]! & 0xff}`
}

function expandIPv6Groups(hostname: string): number[] | undefined {
    const segments = hostname.split('::')
    if (segments.length > 2) {
        return undefined
    }

    const left = segments[0] ? segments[0].split(':') : []
    const right = segments[1] ? segments[1].split(':') : []
    if ([...left, ...right].some(group => !/^[0-9a-f]{1,4}$/i.test(group))) {
        return undefined
    }

    const missing = 8 - left.length - right.length
    if (missing < 0 || (segments.length === 1 && missing !== 0)) {
        return undefined
    }

    return [...left, ...Array<string>(missing).fill('0'), ...right].map(group => Number.parseInt(group, 16) || 0)
}
