type PermissionInput = {
    isMainFrame: boolean
    permission: string
    requestingOrigin: string
    trustedOrigin: string
}

type ExternalOpenInput = {
    disposition: string
    postBodyItems: number
    url: string
}

type DownloadPolicyInput = {
    filename: string
    hasUserGesture: boolean
    isMainFrame: boolean
    mimeType: string
    sourceURL: string
    trustedOrigin: string
    urlChain: string[]
}

type DownloadPolicyDecision =
    | {
          allowed: false
          reason:
              | 'IMAGE_TYPE_MISMATCH'
              | 'MAIN_FRAME_REQUIRED'
              | 'SAFE_FILENAME_REQUIRED'
              | 'SINGLE_BLOB_REQUIRED'
              | 'TRUSTED_BLOB_REQUIRED'
              | 'TRUSTED_SOURCE_REQUIRED'
              | 'USER_GESTURE_REQUIRED'
      }
    | { allowed: true; extension: 'jpeg' | 'jpg' | 'png' | 'webp'; filename: string }

const imageMimeExtensions = {
    'image/jpeg': new Set(['jpeg', 'jpg']),
    'image/png': new Set(['png']),
    'image/webp': new Set(['webp']),
} as const

export function isTrustedWorkspaceUrl(value: string, trustedOrigin: string): boolean {
    try {
        const target = new URL(value)
        const trusted = new URL(trustedOrigin)

        return !target.username && !target.password && target.origin === trusted.origin
    } catch {
        return false
    }
}

export function isSafeExternalUrl(value: string): boolean {
    try {
        const target = new URL(value)

        return target.protocol === 'https:' && !target.username && !target.password
    } catch {
        return false
    }
}

export function shouldAllowExternalOpen(input: ExternalOpenInput): boolean {
    if (!isSafeExternalUrl(input.url) || input.postBodyItems !== 0) {
        return false
    }

    // Windows behavior evidence cannot distinguish user activation from script execution.
    return false
}

export function shouldAllowWorkspacePermission(input: PermissionInput): boolean {
    return (
        input.permission === 'clipboard-sanitized-write' &&
        input.isMainFrame &&
        isTrustedWorkspaceUrl(input.requestingOrigin, input.trustedOrigin)
    )
}

export function shouldOverrideCertificateError(): boolean {
    return false
}

export function evaluateImageDownload(input: DownloadPolicyInput): DownloadPolicyDecision {
    if (!input.isMainFrame) {
        return { allowed: false, reason: 'MAIN_FRAME_REQUIRED' }
    }

    if (!isTrustedWorkspaceUrl(input.sourceURL, input.trustedOrigin)) {
        return { allowed: false, reason: 'TRUSTED_SOURCE_REQUIRED' }
    }

    if (!input.hasUserGesture) {
        return { allowed: false, reason: 'USER_GESTURE_REQUIRED' }
    }

    if (input.urlChain.length !== 1 || !input.urlChain[0]?.startsWith('blob:')) {
        return { allowed: false, reason: 'SINGLE_BLOB_REQUIRED' }
    }

    if (!isTrustedBlobUrl(input.urlChain[0], input.trustedOrigin)) {
        return { allowed: false, reason: 'TRUSTED_BLOB_REQUIRED' }
    }

    const filename = input.filename.trim()
    if (
        !filename ||
        filename !== input.filename ||
        filename === '.' ||
        filename === '..' ||
        filename.includes('/') ||
        filename.includes('\\') ||
        [...filename].some(character => {
            const code = character.charCodeAt(0)

            return code <= 0x1f || code === 0x7f
        })
    ) {
        return { allowed: false, reason: 'SAFE_FILENAME_REQUIRED' }
    }

    const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
    const allowedExtensions = imageMimeExtensions[input.mimeType as keyof typeof imageMimeExtensions]
    if (!allowedExtensions || !allowedExtensions.has(extension)) {
        return { allowed: false, reason: 'IMAGE_TYPE_MISMATCH' }
    }

    return {
        allowed: true,
        extension: extension as 'jpeg' | 'jpg' | 'png' | 'webp',
        filename,
    }
}

export function installDownloadPolicy(input: { session: Electron.Session; trustedOrigin: string }): void {
    input.session.on('will-download', (event, item, webContents) => {
        const sourceURL = webContents.getURL()
        const decision = evaluateImageDownload({
            filename: item.getFilename(),
            hasUserGesture: item.hasUserGesture(),
            isMainFrame: isTrustedWorkspaceUrl(sourceURL, input.trustedOrigin),
            mimeType: item.getMimeType(),
            sourceURL,
            trustedOrigin: input.trustedOrigin,
            urlChain: item.getURLChain(),
        })

        if (!decision.allowed) {
            event.preventDefault()
            return
        }

        item.setSaveDialogOptions({
            defaultPath: decision.filename,
            filters: [{ extensions: [decision.extension], name: '图像文件' }],
        })
    })
}

export function installWorkspaceSecurityPolicy(input: {
    session: Electron.Session
    trustedOrigin: string
    webContents: Electron.WebContents
}): void {
    const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
        if (!isTrustedWorkspaceUrl(url, input.trustedOrigin)) {
            event.preventDefault()
        }
    }

    input.webContents.on('will-navigate', preventUntrustedNavigation)
    input.webContents.on('will-frame-navigate', event => {
        preventUntrustedNavigation(event, event.url)
    })
    input.webContents.on('will-redirect', preventUntrustedNavigation)
    input.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    installDownloadPolicy({ session: input.session, trustedOrigin: input.trustedOrigin })

    input.session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
        shouldAllowWorkspacePermission({
            isMainFrame: details.isMainFrame,
            permission,
            requestingOrigin,
            trustedOrigin: input.trustedOrigin,
        })
    )
    input.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        callback(
            shouldAllowWorkspacePermission({
                isMainFrame: details.isMainFrame,
                permission,
                requestingOrigin: details.requestingUrl,
                trustedOrigin: input.trustedOrigin,
            })
        )
    })
}

function isTrustedBlobUrl(value: string, trustedOrigin: string): boolean {
    try {
        const url = new URL(value)
        const trusted = new URL(trustedOrigin)

        return url.protocol === 'blob:' && url.origin === trusted.origin
    } catch {
        return false
    }
}
