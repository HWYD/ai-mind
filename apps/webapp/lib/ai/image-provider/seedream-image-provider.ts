import { seedreamImageProviderConfig } from './image-provider-config'
import { normalizeImageProviderError } from './normalize-image-provider-error'
import { type ImageGenerationInput, type ImageGenerationProvider, ImageProviderError, type InternalTemporaryImageResult } from './types'

type FetchLike = typeof fetch

export class SeedreamImageProvider implements ImageGenerationProvider {
    constructor(
        private readonly apiKey = process.env.AI_MIND_DOUBAO_API_KEY?.trim(),
        private readonly fetcher: FetchLike = fetch
    ) {}

    async generate(input: ImageGenerationInput, options: { signal: AbortSignal }): Promise<InternalTemporaryImageResult> {
        if (!this.apiKey) {
            throw new ImageProviderError('IMAGE_PROVIDER_AUTH_FAILED', 'Image provider is not configured.')
        }

        let response: Response

        try {
            response = await this.fetcher(seedreamImageProviderConfig.endpoint, {
                body: JSON.stringify({
                    model: seedreamImageProviderConfig.model,
                    prompt: input.prompt,
                    response_format: 'url',
                    sequential_image_generation: 'disabled',
                    size: seedreamImageProviderConfig.sizeByAspectRatio[input.aspectRatio],
                }),
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                signal: options.signal,
            })
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error
            }

            throw normalizeImageProviderError(undefined, 'Image provider request could not be confirmed.')
        }

        if (!response.ok) {
            throw normalizeImageProviderError(response.status, 'Image provider rejected the request.')
        }

        let payload: unknown

        try {
            payload = await response.json()
        } catch {
            throw new ImageProviderError('IMAGE_PROVIDER_INVALID_RESULT', 'Image provider returned an invalid result.')
        }

        const providerUrl = getSingleProviderUrl(payload)

        if (!providerUrl) {
            throw new ImageProviderError('IMAGE_PROVIDER_INVALID_RESULT', 'Image provider returned an invalid result.')
        }

        return {
            providerRequestId: response.headers.get('x-request-id') ?? undefined,
            providerUrl,
        }
    }
}

function getSingleProviderUrl(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
        return undefined
    }

    const data = (payload as { data?: unknown }).data

    if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') {
        return undefined
    }

    const url = (data[0] as { url?: unknown }).url

    if (typeof url !== 'string') {
        return undefined
    }

    try {
        const parsed = new URL(url)
        return parsed.protocol === 'https:' &&
            !parsed.username &&
            !parsed.password &&
            !parsed.port &&
            !parsed.hash &&
            isIP(parsed.hostname) === 0 &&
            seedreamImageProviderConfig.resultHosts.includes(parsed.hostname as never)
            ? url
            : undefined
    } catch {
        return undefined
    }
}
import { isIP } from 'node:net'
