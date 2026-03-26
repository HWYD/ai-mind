function createFallbackId(): string {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// 统一生成会话和消息 ID，优先使用 Web Crypto，缺失时再退回到轻量兜底方案。
export function createId(): string {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
        if (typeof globalThis.crypto.randomUUID === 'function') {
            return globalThis.crypto.randomUUID()
        }

        if (typeof globalThis.crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(16)
            globalThis.crypto.getRandomValues(bytes)

            bytes[6] = (bytes[6] & 0x0f) | 0x40
            bytes[8] = (bytes[8] & 0x3f) | 0x80

            const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))

            return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
        }
    }

    return createFallbackId()
}
