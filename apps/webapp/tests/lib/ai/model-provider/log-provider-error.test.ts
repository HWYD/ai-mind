import { afterEach, describe, expect, it, vi } from 'vitest'

import { logProviderError } from '@/lib/ai/model-provider'

describe('logProviderError', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('只输出安全字段，并优先读取 statusCode', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const error = Object.assign(new Error('provider request failed'), {
            headers: {
                authorization: 'secret-token',
            },
            statusCode: 429,
        })

        logProviderError(error)

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const [, payload] = consoleSpy.mock.calls[0]
        expect(JSON.parse(payload)).toEqual({
            messagePreview: 'provider request failed',
            name: 'Error',
            status: 429,
        })
    })

    it('会截断过长 messagePreview', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const error = new Error('a'.repeat(250))

        logProviderError(error)

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const [, payload] = consoleSpy.mock.calls[0]
        expect(payload).toContain('"messagePreview"')
        expect(payload).toContain('a'.repeat(200))
        expect(payload).not.toContain('a'.repeat(201))
    })
})
