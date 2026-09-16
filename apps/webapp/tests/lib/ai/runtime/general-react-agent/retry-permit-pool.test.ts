import { describe, expect, it } from 'vitest'

import { RetryPermitPool } from '@/lib/ai/runtime/general-react-agent/retry-permit-pool'

describe('RetryPermitPool', () => {
    it('does not preallocate retry permits and only records actual synchronous grants', () => {
        const pool = new RetryPermitPool()

        expect(pool.snapshot()).toEqual([])
        expect(pool.tryAcquire({ callId: 'call-1', retryOrdinal: 1 })).toEqual({
            callId: 'call-1',
            permitId: 1,
            retryOrdinal: 1,
        })
        expect(pool.tryAcquire({ callId: 'call-2', retryOrdinal: 1 })).not.toBeInstanceOf(Promise)
        expect(pool.snapshot()).toHaveLength(2)
    })

    it('allows at most two retry attempts per logical call and rejects duplicate grants', () => {
        const pool = new RetryPermitPool()

        expect(pool.tryAcquire({ callId: 'call-a', retryOrdinal: 2 })).toBeNull()
        expect(pool.tryAcquire({ callId: 'call-a', retryOrdinal: 1 })).toMatchObject({ retryOrdinal: 1 })
        expect(pool.tryAcquire({ callId: 'call-a', retryOrdinal: 1 })).toBeNull()
        expect(pool.tryAcquire({ callId: 'call-a', retryOrdinal: 2 })).toMatchObject({ retryOrdinal: 2 })
        expect(pool.tryAcquire({ callId: 'call-a', retryOrdinal: 2 })).toBeNull()
    })

    it('atomically caps the whole Run at four granted retries', async () => {
        const pool = new RetryPermitPool()
        const grants = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
                Promise.resolve().then(() =>
                    pool.tryAcquire({
                        callId: `parallel-call-${index + 1}`,
                        retryOrdinal: 1,
                    })
                )
            )
        )

        expect(grants.filter(Boolean)).toHaveLength(4)
        expect(pool.snapshot()).toHaveLength(4)
        expect(pool.tryAcquire({ callId: 'late-call', retryOrdinal: 1 })).toBeNull()
    })

    it('returns immutable snapshots and grants without a return/release path', () => {
        const pool = new RetryPermitPool()
        const grant = pool.tryAcquire({ callId: 'call-immutable', retryOrdinal: 1 })
        const snapshot = pool.snapshot()

        expect(grant).not.toBeNull()
        expect(grant).not.toHaveProperty('release')
        expect(Object.isFrozen(grant)).toBe(true)
        expect(Object.isFrozen(snapshot)).toBe(true)
        expect(() => (snapshot as unknown[]).push({})).toThrow()
        expect(pool.snapshot()).toEqual([
            {
                callId: 'call-immutable',
                permitId: 1,
                retryOrdinal: 1,
            },
        ])
    })

    it('rejects invalid call identities without consuming Run capacity', () => {
        const pool = new RetryPermitPool()

        expect(() => pool.tryAcquire({ callId: '', retryOrdinal: 1 })).toThrow()
        expect(pool.snapshot()).toEqual([])
    })
})
