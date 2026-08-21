import { describe, expect, it, vi } from 'vitest'

import { ImageProviderError, SeedreamImageProvider } from '@/lib/ai/image-provider'

const resultUrl = 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/path/image.jpg'

describe('SeedreamImageProvider', () => {
    it.each(['square', 'landscape', 'portrait'] as const)('sends the fixed request once for %s', async aspectRatio => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ url: resultUrl }] }), { status: 200 }))
        const provider = new SeedreamImageProvider('test-key', fetcher)

        await expect(
            provider.generate({ aspectRatio, prompt: 'A quiet lake' }, { signal: new AbortController().signal })
        ).resolves.toMatchObject({
            providerUrl: resultUrl,
        })
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(fetcher).toHaveBeenCalledWith(
            'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations',
            expect.objectContaining({ method: 'POST' })
        )
        expect(JSON.parse((fetcher.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
            model: 'doubao-seedream-5.0-lite',
            response_format: 'url',
            sequential_image_generation: 'disabled',
            size: '2K',
        })
    })

    it('rejects missing keys, unsafe/multiple results and provider errors without retrying', async () => {
        await expect(
            new SeedreamImageProvider(undefined, vi.fn()).generate(
                { aspectRatio: 'square', prompt: 'x' },
                { signal: new AbortController().signal }
            )
        ).rejects.toMatchObject({
            code: 'IMAGE_PROVIDER_AUTH_FAILED',
        })
        const fetcher = vi.fn<typeof fetch>(
            async () => new Response(JSON.stringify({ data: [{ url: 'https://example.com/image.jpg' }] }), { status: 200 })
        )

        await expect(
            new SeedreamImageProvider('test-key', fetcher).generate(
                { aspectRatio: 'square', prompt: 'x' },
                { signal: new AbortController().signal }
            )
        ).rejects.toBeInstanceOf(ImageProviderError)
        expect(fetcher).toHaveBeenCalledTimes(1)

        const unsafeFetcher = vi.fn<typeof fetch>(
            async () =>
                new Response(JSON.stringify({ data: [{ url: 'https://user@ark-acg-cn-beijing.tos-cn-beijing.volces.com/image.jpg' }] }), {
                    status: 200,
                })
        )
        await expect(
            new SeedreamImageProvider('test-key', unsafeFetcher).generate(
                { aspectRatio: 'square', prompt: 'x' },
                { signal: new AbortController().signal }
            )
        ).rejects.toMatchObject({ code: 'IMAGE_PROVIDER_INVALID_RESULT' })
    })

    it('preserves the retry metadata for definite provider responses', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response('', { headers: { 'Retry-After': '3' }, status: 429 }))

        await expect(
            new SeedreamImageProvider('test-key', fetcher).generate(
                { aspectRatio: 'square', prompt: 'x' },
                { signal: new AbortController().signal }
            )
        ).rejects.toMatchObject({
            code: 'IMAGE_PROVIDER_BUSY',
            retryAfterMs: 3_000,
            status: 429,
        })
    })
})
