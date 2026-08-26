export function createDocumentSecurityHeaders(nonce: string): Record<string, string> {
    return createSecurityHeaders(`script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`)
}

export function createStaticLandingSecurityHeaders(): Record<string, string> {
    return createSecurityHeaders("script-src 'self' 'unsafe-inline'")
}

function createSecurityHeaders(scriptSource: string): Record<string, string> {
    return {
        'Content-Security-Policy': [
            "default-src 'self'",
            scriptSource,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "media-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "frame-src 'none'",
            "worker-src 'none'",
        ].join('; '),
        'Permissions-Policy': [
            'accelerometer=()',
            'camera=()',
            'clipboard-read=()',
            'display-capture=()',
            'geolocation=()',
            'gyroscope=()',
            'hid=()',
            'microphone=()',
            'payment=()',
            'serial=()',
            'usb=()',
        ].join(', '),
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    }
}
