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

function isPrivateIpv4(hostname: string) {
    const segments = hostname.split('.')
    if (segments.length !== 4 || segments.some(segment => !/^\d{1,3}$/.test(segment))) {
        return false
    }

    const [first = 0, second = 0] = segments.map(Number)
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

function getEmbeddedIpv4(hostname: string): string | undefined {
    const groups = expandIpv6Groups(hostname)
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

function expandIpv6Groups(hostname: string): number[] | undefined {
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

function isPrivateIpv6(hostname: string) {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const embeddedIpv4 = getEmbeddedIpv4(normalized)

    if (embeddedIpv4 && isPrivateIpv4(embeddedIpv4)) {
        return true
    }

    return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb') ||
        normalized.startsWith('ff')
    )
}

function isPrivateHostname(rawHostname: string) {
    const hostname = rawHostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '')
    return (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        isPrivateIpv4(hostname) ||
        (hostname.includes(':') && isPrivateIpv6(hostname))
    )
}

function hasCredentialOrSignatureQuery(url: URL) {
    for (const name of url.searchParams.keys()) {
        const normalizedName = name.toLowerCase()
        if (
            credentialQueryNames.has(normalizedName) ||
            normalizedName.startsWith('x-amz-') ||
            normalizedName.startsWith('x-goog-') ||
            normalizedName === 'sig' ||
            cloudFrontSignatureNames.has(normalizedName)
        ) {
            return true
        }
    }

    return false
}

/** Client-safe counterpart of the outbound policy used before rendering or local persistence. */
export function normalizeSafePublicHttpUrl(value: string): string | null {
    try {
        const url = new URL(value.trim())

        if (
            (url.protocol !== 'http:' && url.protocol !== 'https:') ||
            !url.hostname ||
            url.username ||
            url.password ||
            isPrivateHostname(url.hostname) ||
            hasCredentialOrSignatureQuery(url)
        ) {
            return null
        }

        url.hash = ''
        return url.toString()
    } catch {
        return null
    }
}

/** Only public web URLs and the fixed local-only resource identifiers can enter a recoverable message. */
export function normalizeSafeResourceUri(value: string): string | null {
    const publicUrl = normalizeSafePublicHttpUrl(value)
    if (publicUrl) {
        return publicUrl
    }

    try {
        const url = new URL(value.trim())
        if (
            (url.protocol === 'demo:' || (url.protocol === 'resource:' && url.hostname === 'unknown')) &&
            (url.protocol === 'demo:' || url.pathname === '' || url.pathname === '/') &&
            !url.username &&
            !url.password &&
            !url.port &&
            !url.search &&
            !url.hash
        ) {
            return url.toString()
        }
    } catch {
        // Unsupported resource URI schemes are intentionally excluded from public state.
    }

    return null
}
