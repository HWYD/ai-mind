import { describe, expect, it } from 'vitest'

import { normalizeSafePublicHttpUrl, normalizeSafeResourceUri } from '@/lib/ai/safe-public-url'

describe('safe public URL projection', () => {
    it.each(['http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/'])('rejects IPv4-mapped private IPv6 addresses: %s', value => {
        expect(normalizeSafePublicHttpUrl(value)).toBeNull()
    })

    it('allows only the fixed resource://unknown identifier', () => {
        expect(normalizeSafeResourceUri('resource://unknown')).toBe('resource://unknown')
        expect(normalizeSafeResourceUri('resource://unknown/private/path')).toBeNull()
        expect(normalizeSafeResourceUri('resource://unknown:80')).toBeNull()
        expect(normalizeSafeResourceUri('resource://unknown:123/')).toBeNull()
    })
})
