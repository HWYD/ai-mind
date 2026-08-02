import { isIP } from 'node:net'

import { getPrismaClient, type PrismaClient } from '@ai-mind/database'

import { seedreamImageProviderConfig } from '@/lib/ai/image-provider'

import { ImageGenerationRunRepository, ImageGenerationRunRepositoryError } from './image-generation-run-repository'

const upstreamReadTimeoutMs = 15_000
const maximumImageBytes = 20 * 1024 * 1024
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type TemporaryImageContentErrorCode =
    | 'IMAGE_PROVIDER_RESULT_INVALID'
    | 'IMAGE_RESULT_EXPIRED'
    | 'IMAGE_RESULT_FETCH_TIMEOUT'
    | 'IMAGE_RESULT_FORBIDDEN'
    | 'IMAGE_RESULT_NOT_FOUND'
    | 'IMAGE_RESULT_NOT_READY'
    | 'IMAGE_RESULT_REQUEST_INVALID'

export class TemporaryImageContentError extends Error {
    constructor(
        readonly code: TemporaryImageContentErrorCode,
        message: string
    ) {
        super(message)
        this.name = 'TemporaryImageContentError'
    }
}

export interface TemporaryImageContent {
    body: Uint8Array
    byteLength: number
    fileName: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}

type FetchLike = typeof fetch

export class TemporaryImageContentService {
    constructor(
        private readonly repository = new ImageGenerationRunRepository(),
        private readonly prisma: PrismaClient = getPrismaClient(),
        private readonly fetcher: FetchLike = fetch
    ) {}

    async readOwnedResult(input: { ownerSessionHash: string; runId: string }): Promise<TemporaryImageContent> {
        let imageRun

        try {
            imageRun = await this.repository.getOwnedRun(input)
        } catch (error) {
            if (error instanceof ImageGenerationRunRepositoryError) {
                throw mapRepositoryError(error)
            }
            throw error
        }

        if (imageRun.status === 'cancelled' || imageRun.status === 'failed' || imageRun.status === 'running') {
            throw new TemporaryImageContentError('IMAGE_RESULT_NOT_READY', 'The image result is not available yet.')
        }

        if (imageRun.providerResultStatus === 'expired') {
            throw new TemporaryImageContentError('IMAGE_RESULT_EXPIRED', 'The temporary image result has expired.')
        }

        if (imageRun.providerResultStatus !== 'ready') {
            throw new TemporaryImageContentError('IMAGE_RESULT_NOT_READY', 'The image result is not available yet.')
        }

        const streamRun = await this.prisma.streamRun.findUnique({
            select: {
                ownerSessionHash: true,
                status: true,
            },
            where: {
                id: input.runId,
            },
        })

        if (!streamRun) {
            throw new TemporaryImageContentError('IMAGE_RESULT_NOT_FOUND', 'The image result was not found.')
        }

        if (streamRun.ownerSessionHash !== input.ownerSessionHash) {
            throw new TemporaryImageContentError('IMAGE_RESULT_FORBIDDEN', 'The image result does not belong to this session.')
        }

        if (streamRun.status !== 'completed') {
            throw new TemporaryImageContentError('IMAGE_RESULT_NOT_READY', 'The image result is not available yet.')
        }

        const temporaryResult = await this.repository.getOwnedTemporaryResult(input)

        if (!temporaryResult) {
            throw new TemporaryImageContentError('IMAGE_RESULT_EXPIRED', 'The temporary image result has expired.')
        }

        validateProviderUrl(temporaryResult.providerUrl)
        const { bytes, mimeType } = await this.fetchProviderImage(temporaryResult.providerUrl)

        if (!matchesImageMagicBytes(bytes, mimeType)) {
            throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result failed content validation.')
        }

        await this.repository.recordTemporaryContentMetadata({
            byteLength: bytes.byteLength,
            mimeType,
            runId: input.runId,
        })

        return {
            body: bytes,
            byteLength: bytes.byteLength,
            fileName: `ai-mind-image-${input.runId}.${fileExtensionForMimeType(mimeType)}`,
            mimeType,
        }
    }

    private async fetchProviderImage(providerUrl: string): Promise<{ bytes: Uint8Array; mimeType: TemporaryImageContent['mimeType'] }> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), upstreamReadTimeoutMs)

        try {
            const response = await this.fetcher(providerUrl, {
                redirect: 'manual',
                signal: controller.signal,
            })

            if (response.status >= 300 && response.status < 400) {
                throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result redirected unexpectedly.')
            }

            if (!response.ok) {
                throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result could not be fetched.')
            }

            const declaredSize = response.headers.get('content-length')
            if (declaredSize && (!/^\d+$/u.test(declaredSize) || Number(declaredSize) > maximumImageBytes)) {
                throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result exceeds the allowed size.')
            }

            const mimeType = normalizeMimeType(response.headers.get('content-type'))
            const bytes = await readBoundedImageBytes(response)

            return { bytes, mimeType }
        } catch (error) {
            if (error instanceof TemporaryImageContentError) {
                throw error
            }

            if (controller.signal.aborted) {
                throw new TemporaryImageContentError('IMAGE_RESULT_FETCH_TIMEOUT', 'The image result timed out.')
            }

            throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result could not be fetched.')
        } finally {
            clearTimeout(timeout)
        }
    }
}

function mapRepositoryError(error: ImageGenerationRunRepositoryError): TemporaryImageContentError {
    if (error.code === 'IMAGE_GENERATION_RUN_FORBIDDEN') {
        return new TemporaryImageContentError('IMAGE_RESULT_FORBIDDEN', 'The image result does not belong to this session.')
    }

    return new TemporaryImageContentError('IMAGE_RESULT_NOT_FOUND', 'The image result was not found.')
}

function validateProviderUrl(value: string): void {
    let url: URL

    try {
        url = new URL(value)
    } catch {
        throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result URL is invalid.')
    }

    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        isIP(url.hostname) !== 0 ||
        !seedreamImageProviderConfig.resultHosts.includes(url.hostname as (typeof seedreamImageProviderConfig.resultHosts)[number])
    ) {
        throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result URL is not allowed.')
    }
}

function normalizeMimeType(contentType: string | null): 'image/jpeg' | 'image/png' | 'image/webp' {
    const mimeType = contentType?.split(';', 1)[0]?.trim().toLowerCase()

    if (!mimeType || !allowedMimeTypes.has(mimeType)) {
        throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result has an unsupported content type.')
    }

    return mimeType as 'image/jpeg' | 'image/png' | 'image/webp'
}

async function readBoundedImageBytes(response: Response): Promise<Uint8Array> {
    if (!response.body) {
        throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result body is empty.')
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let byteLength = 0

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }

            byteLength += value.byteLength
            if (byteLength > maximumImageBytes) {
                throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result exceeds the allowed size.')
            }
            chunks.push(value)
        }
    } catch (error) {
        await reader.cancel().catch(() => undefined)
        throw error
    } finally {
        reader.releaseLock()
    }

    if (byteLength === 0) {
        throw new TemporaryImageContentError('IMAGE_PROVIDER_RESULT_INVALID', 'The image result body is empty.')
    }

    const bytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }

    return bytes
}

function matchesImageMagicBytes(bytes: Uint8Array, mimeType: TemporaryImageContent['mimeType']): boolean {
    if (mimeType === 'image/jpeg') {
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    }

    if (mimeType === 'image/png') {
        return (
            bytes.length >= 8 &&
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47 &&
            bytes[4] === 0x0d &&
            bytes[5] === 0x0a &&
            bytes[6] === 0x1a &&
            bytes[7] === 0x0a
        )
    }

    return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    )
}

function fileExtensionForMimeType(mimeType: TemporaryImageContent['mimeType']): 'jpg' | 'png' | 'webp' {
    if (mimeType === 'image/jpeg') {
        return 'jpg'
    }

    return mimeType === 'image/png' ? 'png' : 'webp'
}
