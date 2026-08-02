import { describe, expect, it, vi } from 'vitest'

import {
    TemporaryImageContentError,
    TemporaryImageContentService,
} from '@/lib/ai/runtime/image-generation-agent/temporary-image-content-service'

const ownerSessionHash = 'a'.repeat(64)
const runId = '123e4567-e89b-42d3-a456-426614174000'
const allowedUrl = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/image.jpg'

function createService(options: { contentType?: string; providerUrl?: string; response?: Response } = {}) {
    const repository = {
        getOwnedRun: vi.fn().mockResolvedValue({
            providerResultStatus: 'ready',
            status: 'completed',
        }),
        getOwnedTemporaryResult: vi.fn().mockResolvedValue({
            providerUrl: options.providerUrl ?? allowedUrl,
        }),
        recordTemporaryContentMetadata: vi.fn().mockResolvedValue(undefined),
    }
    const prisma = {
        streamRun: {
            findUnique: vi.fn().mockResolvedValue({
                ownerSessionHash,
                status: 'completed',
            }),
        },
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        options.response ??
            new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), {
                headers: {
                    'content-type': options.contentType ?? 'image/jpeg',
                },
            })
    )

    return {
        fetcher,
        repository,
        service: new TemporaryImageContentService(repository as never, prisma as never, fetcher),
    }
}

describe('TemporaryImageContentService', () => {
    it('reads only the reviewed provider host and returns bounded validated bytes', async () => {
        const { fetcher, repository, service } = createService()

        const result = await service.readOwnedResult({ ownerSessionHash, runId })

        expect(result).toMatchObject({
            byteLength: 4,
            fileName: `ai-mind-image-${runId}.jpg`,
            mimeType: 'image/jpeg',
        })
        expect(fetcher).toHaveBeenCalledWith(allowedUrl, {
            redirect: 'manual',
            signal: expect.any(AbortSignal),
        })
        expect(repository.recordTemporaryContentMetadata).toHaveBeenCalledWith({
            byteLength: 4,
            mimeType: 'image/jpeg',
            runId,
        })
    })

    it.each([
        'http://ark-acg-cn-beijing.tos-cn-beijing.volces.com/image.jpg',
        'https://127.0.0.1/image.jpg',
        'https://user@ark-acg-cn-beijing.tos-cn-beijing.volces.com/image.jpg',
        'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com:444/image.jpg',
        'https://untrusted.example.com/image.jpg',
    ])('rejects an unsafe provider URL before fetching: %s', async providerUrl => {
        const { fetcher, service } = createService({ providerUrl })

        await expect(service.readOwnedResult({ ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'IMAGE_PROVIDER_RESULT_INVALID',
        })
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('rejects redirects and MIME/magic-byte mismatches', async () => {
        const redirect = createService({ response: new Response(null, { status: 302 }) })
        await expect(redirect.service.readOwnedResult({ ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'IMAGE_PROVIDER_RESULT_INVALID',
        })

        const mismatch = createService({
            contentType: 'image/png',
            response: new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/png' } }),
        })
        await expect(mismatch.service.readOwnedResult({ ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'IMAGE_PROVIDER_RESULT_INVALID',
        })
    })
})
