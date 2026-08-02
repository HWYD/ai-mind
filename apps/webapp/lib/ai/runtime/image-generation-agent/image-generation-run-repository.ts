import { getPrismaClient, type ImageGenerationRun, type Prisma, type PrismaClient } from '@ai-mind/database'

import { seedreamImageProviderConfig } from '@/lib/ai/image-provider'

import { type PublicImageBriefSummary, publicImageBriefSummarySchema } from './contract/image-generation-contracts'

const maximumTemporaryResultLifetimeMs = 10 * 60 * 1000
const defaultExpiredResultCleanupLimit = 100

export type ImageGenerationRunRepositoryErrorCode =
    | 'IMAGE_GENERATION_ALREADY_ACTIVE'
    | 'IMAGE_GENERATION_RUN_FORBIDDEN'
    | 'IMAGE_GENERATION_RUN_NOT_ACTIVE'
    | 'IMAGE_GENERATION_RUN_NOT_FOUND'

export class ImageGenerationRunRepositoryError extends Error {
    constructor(
        readonly code: ImageGenerationRunRepositoryErrorCode,
        message: string
    ) {
        super(message)
        this.name = 'ImageGenerationRunRepositoryError'
    }
}

export interface CreateImageGenerationRunInput {
    activeLeaseExpiresAt: Date
    assistantMessageId: string
    conversationId: string
    ownerSessionHash: string
    streamRunId: string
}

export interface PublishImageGenerationResultInput {
    providerRequestId?: string
    providerResultExpiresAt?: Date
    providerResultHeight?: number
    providerResultMimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
    providerResultUrl: string
    providerResultWidth?: number
    runId: string
}

export interface TemporaryImageResultRecord {
    expiresAt: Date
    height: number | null
    mimeType: string | null
    providerUrl: string
    runId: string
    width: number | null
}

export class ImageGenerationRunRepository {
    constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

    async createActiveRun(input: CreateImageGenerationRunInput): Promise<ImageGenerationRun> {
        await this.reconcileStaleLeases()
        await this.cleanupExpiredResults()

        try {
            return await this.prisma.imageGenerationRun.create({
                data: {
                    activeLeaseExpiresAt: input.activeLeaseExpiresAt,
                    activeOwnerSessionHash: input.ownerSessionHash,
                    assistantMessageId: input.assistantMessageId,
                    conversationId: input.conversationId,
                    ownerSessionHash: input.ownerSessionHash,
                    provider: 'doubao',
                    providerModel: seedreamImageProviderConfig.model,
                    stage: 'received',
                    status: 'running',
                    streamRunId: input.streamRunId,
                },
            })
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                throw new ImageGenerationRunRepositoryError(
                    'IMAGE_GENERATION_ALREADY_ACTIVE',
                    'An active image generation run already exists for this session.'
                )
            }

            throw error
        }
    }

    async getOwnedRun(input: { ownerSessionHash: string; runId: string }): Promise<ImageGenerationRun> {
        const run = await this.prisma.imageGenerationRun.findUnique({
            where: {
                streamRunId: input.runId,
            },
        })

        if (!run) {
            throw new ImageGenerationRunRepositoryError('IMAGE_GENERATION_RUN_NOT_FOUND', 'Image generation run was not found.')
        }

        if (run.ownerSessionHash !== input.ownerSessionHash) {
            throw new ImageGenerationRunRepositoryError(
                'IMAGE_GENERATION_RUN_FORBIDDEN',
                'Image generation run is not owned by this session.'
            )
        }

        return run
    }

    async recordPublicBrief(input: { runId: string; summary: PublicImageBriefSummary }): Promise<ImageGenerationRun | undefined> {
        const summary = publicImageBriefSummarySchema.parse(input.summary)
        const updated = await this.prisma.imageGenerationRun.updateMany({
            data: {
                publicBriefSummaryJson: summary as Prisma.InputJsonValue,
                stage: 'prompting',
            },
            where: {
                status: 'running',
                streamRunId: input.runId,
            },
        })

        return updated.count === 1 ? this.prisma.imageGenerationRun.findUniqueOrThrow({ where: { streamRunId: input.runId } }) : undefined
    }

    async markPromptRevisionStarted(runId: string): Promise<ImageGenerationRun | undefined> {
        const updated = await this.prisma.imageGenerationRun.updateMany({
            data: {
                promptRevisionCount: {
                    increment: 1,
                },
                stage: 'prompting',
            },
            where: {
                promptRevisionCount: 0,
                status: 'running',
                streamRunId: runId,
            },
        })

        return updated.count === 1 ? this.prisma.imageGenerationRun.findUniqueOrThrow({ where: { streamRunId: runId } }) : undefined
    }

    async markGenerationStarted(runId: string): Promise<ImageGenerationRun | undefined> {
        const updated = await this.prisma.imageGenerationRun.updateMany({
            data: {
                imageGenerationCount: {
                    increment: 1,
                },
                stage: 'generating',
            },
            where: {
                activeOwnerSessionHash: {
                    not: null,
                },
                imageGenerationCount: 0,
                status: 'running',
                streamRunId: runId,
            },
        })

        return updated.count === 1 ? this.prisma.imageGenerationRun.findUniqueOrThrow({ where: { streamRunId: runId } }) : undefined
    }

    async publishResult(input: PublishImageGenerationResultInput, now = new Date()): Promise<ImageGenerationRun | undefined> {
        const providerResultExpiresAt = resolveTemporaryResultExpiry(input.providerResultExpiresAt, now)
        const updated = await this.prisma.imageGenerationRun.updateMany({
            data: {
                activeLeaseExpiresAt: null,
                activeOwnerSessionHash: null,
                completedAt: now,
                providerRequestId: input.providerRequestId,
                providerResultExpiresAt,
                providerResultHeight: input.providerResultHeight,
                providerResultMimeType: input.providerResultMimeType,
                providerResultStatus: 'ready',
                providerResultUrl: input.providerResultUrl,
                providerResultWidth: input.providerResultWidth,
                stage: 'completed',
                status: 'completed',
            },
            where: {
                imageGenerationCount: 1,
                status: 'running',
                streamRunId: input.runId,
            },
        })

        return updated.count === 1 ? this.prisma.imageGenerationRun.findUniqueOrThrow({ where: { streamRunId: input.runId } }) : undefined
    }

    async markFailed(input: { failureCode: string; publicFailureMessage: string; runId: string }, now = new Date()) {
        return this.markTerminal(input.runId, 'failed', {
            failedAt: now,
            failureCode: input.failureCode.slice(0, 128),
            publicFailureMessage: input.publicFailureMessage.slice(0, 1000),
        })
    }

    async markCancelled(runId: string, now = new Date()) {
        return this.markTerminal(runId, 'cancelled', {
            cancelledAt: now,
        })
    }

    async getOwnedTemporaryResult(input: {
        now?: Date
        ownerSessionHash: string
        runId: string
    }): Promise<TemporaryImageResultRecord | undefined> {
        const now = input.now ?? new Date()
        await this.cleanupExpiredResults({ now })

        const result = await this.prisma.imageGenerationRun.findFirst({
            select: {
                providerResultExpiresAt: true,
                providerResultHeight: true,
                providerResultMimeType: true,
                providerResultUrl: true,
                providerResultWidth: true,
                streamRunId: true,
            },
            where: {
                ownerSessionHash: input.ownerSessionHash,
                providerResultExpiresAt: {
                    gt: now,
                },
                providerResultStatus: 'ready',
                status: 'completed',
                streamRunId: input.runId,
            },
        })

        if (!result?.providerResultUrl || !result.providerResultExpiresAt) {
            return undefined
        }

        return {
            expiresAt: result.providerResultExpiresAt,
            height: result.providerResultHeight,
            mimeType: result.providerResultMimeType,
            providerUrl: result.providerResultUrl,
            runId: result.streamRunId,
            width: result.providerResultWidth,
        }
    }

    async cleanupExpiredResults(input: { limit?: number; now?: Date } = {}): Promise<number> {
        const now = input.now ?? new Date()
        const limit = input.limit ?? defaultExpiredResultCleanupLimit
        const expired = await this.prisma.imageGenerationRun.findMany({
            select: {
                id: true,
            },
            take: limit,
            where: {
                providerResultExpiresAt: {
                    lte: now,
                },
                providerResultStatus: 'ready',
            },
        })

        if (expired.length === 0) {
            return 0
        }

        const result = await this.prisma.imageGenerationRun.updateMany({
            data: {
                providerResultStatus: 'expired',
                providerResultUrl: null,
            },
            where: {
                id: {
                    in: expired.map(run => run.id),
                },
                providerResultExpiresAt: {
                    lte: now,
                },
                providerResultStatus: 'ready',
            },
        })

        return result.count
    }

    async recordTemporaryContentMetadata(input: {
        byteLength: number
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
        runId: string
    }): Promise<void> {
        await this.prisma.imageGenerationRun.updateMany({
            data: {
                providerResultByteLength: input.byteLength,
                providerResultMimeType: input.mimeType,
            },
            where: {
                providerResultStatus: 'ready',
                status: 'completed',
                streamRunId: input.runId,
            },
        })
    }

    async reconcileStaleLeases(now = new Date()): Promise<number> {
        const result = await this.prisma.imageGenerationRun.updateMany({
            data: {
                activeLeaseExpiresAt: null,
                activeOwnerSessionHash: null,
                failedAt: now,
                failureCode: 'IMAGE_GENERATION_STALE_LEASE',
                providerResultStatus: 'discarded',
                providerResultUrl: null,
                publicFailureMessage: '图像生成任务已中断，请重新发起 /image。',
                stage: 'failed',
                status: 'failed',
            },
            where: {
                activeLeaseExpiresAt: {
                    lte: now,
                },
                status: 'running',
            },
        })

        return result.count
    }

    private async markTerminal(
        runId: string,
        status: 'cancelled' | 'failed',
        terminalData: Prisma.ImageGenerationRunUpdateManyMutationInput
    ): Promise<ImageGenerationRun | undefined> {
        const updated = await this.prisma.imageGenerationRun.updateMany({
            data: {
                ...terminalData,
                activeLeaseExpiresAt: null,
                activeOwnerSessionHash: null,
                providerResultStatus: 'discarded',
                providerResultUrl: null,
                stage: status,
                status,
            },
            where: {
                status: 'running',
                streamRunId: runId,
            },
        })

        return updated.count === 1 ? this.prisma.imageGenerationRun.findUniqueOrThrow({ where: { streamRunId: runId } }) : undefined
    }
}

function resolveTemporaryResultExpiry(reliableProviderExpiry: Date | undefined, now: Date): Date {
    const maximumExpiry = new Date(now.getTime() + maximumTemporaryResultLifetimeMs)

    if (!reliableProviderExpiry || reliableProviderExpiry > maximumExpiry) {
        return maximumExpiry
    }

    return reliableProviderExpiry
}

function isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
}
