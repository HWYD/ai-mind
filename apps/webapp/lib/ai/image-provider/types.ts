export const imageProviderErrorCodes = [
    'IMAGE_GENERATION_AMBIGUOUS',
    'IMAGE_PROVIDER_AUTH_FAILED',
    'IMAGE_PROVIDER_BUSY',
    'IMAGE_PROVIDER_CONTENT_REJECTED',
    'IMAGE_PROVIDER_INVALID_RESULT',
    'IMAGE_PROVIDER_UNAVAILABLE',
] as const

export type ImageProviderErrorCode = (typeof imageProviderErrorCodes)[number]

export class ImageProviderError extends Error {
    constructor(
        readonly code: ImageProviderErrorCode,
        message: string
    ) {
        super(message)
        this.name = 'ImageProviderError'
    }
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
