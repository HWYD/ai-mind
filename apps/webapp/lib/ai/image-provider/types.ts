export const imageProviderErrorCodes = [
    'IMAGE_GENERATION_AMBIGUOUS',
    'IMAGE_PROVIDER_AUTH_FAILED',
    'IMAGE_PROVIDER_BUSY',
    'IMAGE_PROVIDER_CONTENT_REJECTED',
    'IMAGE_PROVIDER_INVALID_RESULT',
    'IMAGE_PROVIDER_UNAVAILABLE',
] as const

export type ImageProviderErrorCode = (typeof imageProviderErrorCodes)[number]

export interface ImageProviderErrorOptions {
    retryAfterMs?: number
    status?: number
}

export class ImageProviderError extends Error {
    constructor(
        readonly code: ImageProviderErrorCode,
        message: string,
        options: ImageProviderErrorOptions = {}
    ) {
        super(message)
        this.name = 'ImageProviderError'
        this.retryAfterMs = options.retryAfterMs
        this.status = options.status
    }

    readonly retryAfterMs: number | undefined
    readonly status: number | undefined
}

export interface ImageGenerationInput {
    prompt: string
    aspectRatio: 'landscape' | 'portrait' | 'square'
}

export interface InternalTemporaryImageResult {
    providerRequestId?: string
    providerUrl: string
    expiresAt?: Date
    height?: number
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
    width?: number
}

export interface ImageGenerationProvider {
    generate(input: ImageGenerationInput, options: { signal: AbortSignal }): Promise<InternalTemporaryImageResult>
}
