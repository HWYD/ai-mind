import { describe, expect, it } from 'vitest'

import { normalizeImageProviderError } from '@/lib/ai/image-provider'

describe('normalizeImageProviderError', () => {
    it.each([
        [401, 'IMAGE_PROVIDER_AUTH_FAILED'],
        [403, 'IMAGE_PROVIDER_AUTH_FAILED'],
        [429, 'IMAGE_PROVIDER_BUSY'],
        [400, 'IMAGE_PROVIDER_CONTENT_REJECTED'],
        [503, 'IMAGE_PROVIDER_UNAVAILABLE'],
        [undefined, 'IMAGE_GENERATION_AMBIGUOUS'],
    ] as const)('maps status %s to a safe domain code', (status, code) => {
        expect(normalizeImageProviderError(status, 'safe message').code).toBe(code)
    })
})
