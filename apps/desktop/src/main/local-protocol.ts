export const LOCAL_PROTOCOL_SCHEME = 'ai-mind-desktop'
export const LOCAL_PROTOCOL_ORIGIN = 'ai-mind-desktop://local'
export const LOCAL_CHROME_PROTOCOL_URL = 'ai-mind-desktop://local/chrome/index.html'

export function isRecoveryProtocolUrl(value: string): boolean {
    try {
        const url = new URL(value)

        return (
            url.protocol === `${LOCAL_PROTOCOL_SCHEME}:` &&
            url.hostname === 'local' &&
            !url.username &&
            !url.password &&
            !url.port &&
            !url.search &&
            !url.hash &&
            (url.pathname === '/' || url.pathname === '/index.html')
        )
    } catch {
        return false
    }
}

type RecoveryProtocolRequest = { url: string }
type RecoveryProtocolHandler = (request: RecoveryProtocolRequest) => Promise<Response>
type RecoveryProtocol = {
    handle: (scheme: string, handler: RecoveryProtocolHandler) => void
}

type PrivilegedProtocol = {
    registerSchemesAsPrivileged: (schemes: Array<{ privileges: { secure: boolean; standard: boolean }; scheme: string }>) => void
}

type ReadRecoveryAsset = (path: string) => Promise<Uint8Array>

const localAssets = new Map([
    ['/', { contentType: 'text/html; charset=utf-8', directory: 'recovery', fileName: 'index.html' }],
    ['/index.html', { contentType: 'text/html; charset=utf-8', directory: 'recovery', fileName: 'index.html' }],
    ['/recovery/index.js', { contentType: 'text/javascript; charset=utf-8', directory: 'recovery', fileName: 'index.js' }],
    ['/recovery/styles.css', { contentType: 'text/css; charset=utf-8', directory: 'recovery', fileName: 'styles.css' }],
    ['/chrome/', { contentType: 'text/html; charset=utf-8', directory: 'chrome', fileName: 'index.html' }],
    ['/chrome/index.html', { contentType: 'text/html; charset=utf-8', directory: 'chrome', fileName: 'index.html' }],
    ['/chrome/index.js', { contentType: 'text/javascript; charset=utf-8', directory: 'chrome', fileName: 'index.js' }],
    ['/chrome/styles.css', { contentType: 'text/css; charset=utf-8', directory: 'chrome', fileName: 'styles.css' }],
])

const localContentSecurityPolicy = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
].join('; ')

export class LocalProtocolRegistrar {
    #registered = false

    registerBeforeReady(protocol: PrivilegedProtocol): void {
        if (this.#registered) {
            throw new Error('Local protocol scheme is already registered.')
        }

        protocol.registerSchemesAsPrivileged([
            {
                privileges: { secure: true, standard: true },
                scheme: LOCAL_PROTOCOL_SCHEME,
            },
        ])
        this.#registered = true
    }
}

export function installRecoveryProtocolHandler(input: {
    assetRoot: string
    protocol: RecoveryProtocol
    readFile?: ReadRecoveryAsset
}): void {
    input.protocol.handle(
        LOCAL_PROTOCOL_SCHEME,
        createRecoveryProtocolHandler({
            assetRoot: input.assetRoot,
            readFile: input.readFile ?? readFileFromPackage,
        })
    )
}

export function createRecoveryProtocolHandler(input: { assetRoot: string; readFile: ReadRecoveryAsset }): RecoveryProtocolHandler {
    return async request => {
        const asset = resolveRecoveryAsset(request.url)

        if (!asset) {
            return new Response(null, { status: 404 })
        }

        try {
            const body = await input.readFile(`${input.assetRoot}/${asset.directory}/${asset.fileName}`)
            const responseBody = new Uint8Array(body.byteLength)
            responseBody.set(body)

            return new Response(responseBody.buffer, {
                headers: {
                    'Content-Security-Policy': localContentSecurityPolicy,
                    'Content-Type': asset.contentType,
                    'X-Content-Type-Options': 'nosniff',
                },
            })
        } catch {
            return new Response(null, { status: 404 })
        }
    }
}

function resolveRecoveryAsset(requestUrl: string): { contentType: string; directory: string; fileName: string } | undefined {
    if (hasPathTraversal(requestUrl)) {
        return undefined
    }

    try {
        const url = new URL(requestUrl)

        if (
            url.protocol !== `${LOCAL_PROTOCOL_SCHEME}:` ||
            url.hostname !== 'local' ||
            url.username ||
            url.password ||
            url.port ||
            url.search ||
            url.hash
        ) {
            return undefined
        }

        return localAssets.get(url.pathname)
    } catch {
        return undefined
    }
}

function hasPathTraversal(value: string): boolean {
    return /(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/iu.test(value)
}

async function readFileFromPackage(filePath: string): Promise<Uint8Array> {
    const { readFile } = await import('node:fs/promises')

    return readFile(filePath)
}
