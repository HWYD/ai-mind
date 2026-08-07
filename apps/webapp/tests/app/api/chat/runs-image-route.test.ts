import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readOwnedResultMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/rate-limit', () => ({
    resolveSessionId: () => ({
        sessionId: 'image-session',
        setCookie:
            'ai-mind-session-id=image-session; Max-Age=2592000; Expires=Fri, 04 Sep 2026 00:00:00 GMT; HttpOnly; SameSite=Lax; Path=/',
    }),
}))

vi.mock('@/lib/ai/runtime/image-generation-agent/temporary-image-content-service', () => ({
    TemporaryImageContentError: class TemporaryImageContentError extends Error {
        constructor(
            readonly code: string,
            message: string
        ) {
            super(message)
        }
    },
    TemporaryImageContentService: class TemporaryImageContentService {
        readOwnedResult = readOwnedResultMock
    },
}))

import { GET } from '@/app/api/chat/runs/[runId]/image/route'
import { TemporaryImageContentError } from '@/lib/ai/runtime/image-generation-agent/temporary-image-content-service'

const runId = '123e4567-e89b-42d3-a456-426614174000'

describe('GET /api/chat/runs/[runId]/image', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        readOwnedResultMock.mockResolvedValue({
            body: new Uint8Array([0xff, 0xd8, 0xff]),
            byteLength: 3,
            fileName: 'ai-mind-image.jpg',
            mimeType: 'image/jpeg',
        })
    })

    it('returns same-origin validated bytes with private no-store headers', async () => {
        const response = await GET(new NextRequest(`http://localhost/api/chat/runs/${runId}/image`), { params: { runId } })

        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('private, no-store')
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(response.headers.get('Content-Type')).toBe('image/jpeg')
        expect(response.headers.get('Set-Cookie')).toContain('ai-mind-session-id=image-session')
        expect(response.headers.get('Set-Cookie')).toContain('Max-Age=2592000')
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
    })

    it('rejects invalid run IDs before lookup', async () => {
        const response = await GET(new NextRequest('http://localhost/api/chat/runs/not-a-uuid/image'), {
            params: { runId: 'not-a-uuid' },
        })

        expect(response.status).toBe(400)
        expect(readOwnedResultMock).not.toHaveBeenCalled()
    })

    it('maps temporary result expiry without exposing provider details', async () => {
        readOwnedResultMock.mockRejectedValueOnce(new TemporaryImageContentError('IMAGE_RESULT_EXPIRED', 'private provider detail'))

        const response = await GET(new NextRequest(`http://localhost/api/chat/runs/${runId}/image`), { params: { runId } })
        await expect(response.json()).resolves.toEqual({
            code: 'IMAGE_RESULT_EXPIRED',
            error: '临时图片已过期，请重新发起 /image。',
        })
        expect(response.status).toBe(410)
    })
})
