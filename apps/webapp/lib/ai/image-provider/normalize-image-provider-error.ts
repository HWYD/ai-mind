import { ImageProviderError, type ImageProviderErrorCode, type ImageProviderErrorOptions } from './types'

export function normalizeImageProviderError(
    status: number | undefined,
    message: string,
    options: Omit<ImageProviderErrorOptions, 'status'> = {}
): ImageProviderError {
    const code: ImageProviderErrorCode =
        status === 401 || status === 403
            ? 'IMAGE_PROVIDER_AUTH_FAILED'
            : status === 429
              ? 'IMAGE_PROVIDER_BUSY'
              : status !== undefined && status >= 500
                ? 'IMAGE_PROVIDER_UNAVAILABLE'
                : status !== undefined && status >= 400
                  ? 'IMAGE_PROVIDER_CONTENT_REJECTED'
                  : 'IMAGE_GENERATION_AMBIGUOUS'

    return new ImageProviderError(code, message, { ...options, status })
}
