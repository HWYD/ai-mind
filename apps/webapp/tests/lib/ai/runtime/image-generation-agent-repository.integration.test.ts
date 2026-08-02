import { getPrismaClient } from '@ai-mind/database'
import { afterEach, describe, expect, it } from 'vitest'

import {
    ImageGenerationRunRepository,
    ImageGenerationRunRepositoryError,
} from '@/lib/ai/runtime/image-generation-agent/image-generation-run-repository'

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim())
const describeWithDatabase = hasDatabase ? describe : describe.skip
const ownerSessionHash = 'b'.repeat(64)
const otherOwnerSessionHash = 'c'.repeat(64)
const prisma = hasDatabase ? getPrismaClient() : undefined
const createdStreamRunIds: string[] = []

async function createStreamRun(sessionOwnerHash = ownerSessionHash) {
    const streamRun = await prisma!.streamRun.create({
        data: {
            kind: 'image_generation',
            maxEventPayloadBytes: 262_144,
            maxRetainedEvents: 20_000,
            ownerSessionHash: sessionOwnerHash,
            retentionUntil: new Date(Date.now() + 10 * 60 * 1000),
            status: 'running',
        },
    })
    createdStreamRunIds.push(streamRun.id)

    return streamRun
}

async function createActiveImageRun(repository: ImageGenerationRunRepository, owner = ownerSessionHash) {
    const streamRun = await createStreamRun(owner)

    return repository.createActiveRun({
        activeLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        assistantMessageId: `assistant-${streamRun.id}`,
        conversationId: `conversation-${streamRun.id}`,
        ownerSessionHash: owner,
        streamRunId: streamRun.id,
    })
}

describeWithDatabase('ImageGenerationRun repository integration', () => {
    afterEach(async () => {
        const streamRunIds = createdStreamRunIds.splice(0)

        if (streamRunIds.length > 0) {
            await prisma!.streamRun.deleteMany({
                where: {
                    id: {
                        in: streamRunIds,
                    },
                },
            })
        }
    })

    it('uses the same original StreamRun identity for an idempotent image replay and creates one business run', async () => {
        const repository = new ImageGenerationRunRepository()
        const streamRun = await createStreamRun()
        const created = await repository.createActiveRun({
            activeLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
            assistantMessageId: 'assistant-image-idempotent',
            conversationId: 'conversation-image-idempotent',
            ownerSessionHash,
            streamRunId: streamRun.id,
        })
        const replay = await repository.getOwnedRun({
            ownerSessionHash,
            runId: streamRun.id,
        })

        expect(replay.id).toBe(created.id)
        expect(replay.streamRunId).toBe(streamRun.id)
        await expect(
            repository.createActiveRun({
                activeLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
                assistantMessageId: 'assistant-image-duplicate',
                conversationId: 'conversation-image-duplicate',
                ownerSessionHash,
                streamRunId: streamRun.id,
            })
        ).rejects.toBeInstanceOf(ImageGenerationRunRepositoryError)
    })

    it('allows only one active run for a session, atomically marks generation once, and releases the lease at completion', async () => {
        const repository = new ImageGenerationRunRepository()
        const created = await createActiveImageRun(repository)
        const secondStreamRun = await createStreamRun()

        await expect(
            repository.createActiveRun({
                activeLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
                assistantMessageId: `assistant-${secondStreamRun.id}`,
                conversationId: `conversation-${secondStreamRun.id}`,
                ownerSessionHash,
                streamRunId: secondStreamRun.id,
            })
        ).rejects.toMatchObject({ code: 'IMAGE_GENERATION_ALREADY_ACTIVE' })

        const generationAttempts = await Promise.all([
            repository.markGenerationStarted(created.streamRunId),
            repository.markGenerationStarted(created.streamRunId),
        ])

        expect(generationAttempts.filter(Boolean)).toHaveLength(1)
        const completedAt = new Date('2026-07-29T08:00:00.000Z')
        const completed = await repository.publishResult(
            {
                providerResultUrl: 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/result.jpg',
                runId: created.streamRunId,
            },
            completedAt
        )

        expect(completed).toMatchObject({
            activeLeaseExpiresAt: null,
            activeOwnerSessionHash: null,
            imageGenerationCount: 1,
            providerResultStatus: 'ready',
            status: 'completed',
        })
        expect(completed?.providerResultExpiresAt).toEqual(new Date(completedAt.getTime() + 10 * 60 * 1000))
    })

    it('checks ownership and logical expiry before returning the server-private temporary URL, then atomically scrubs expired URLs', async () => {
        const repository = new ImageGenerationRunRepository()
        const created = await createActiveImageRun(repository)
        await repository.markGenerationStarted(created.streamRunId)
        const now = new Date('2026-07-29T08:00:00.000Z')
        await repository.publishResult(
            {
                providerResultExpiresAt: new Date(now.getTime() + 30_000),
                providerResultUrl: 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/result.jpg',
                runId: created.streamRunId,
            },
            now
        )

        await expect(repository.getOwnedRun({ ownerSessionHash: otherOwnerSessionHash, runId: created.streamRunId })).rejects.toMatchObject(
            {
                code: 'IMAGE_GENERATION_RUN_FORBIDDEN',
            }
        )
        await expect(repository.getOwnedTemporaryResult({ now, ownerSessionHash, runId: created.streamRunId })).resolves.toMatchObject({
            providerUrl: 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/result.jpg',
        })
        await expect(
            repository.getOwnedTemporaryResult({ now: new Date(now.getTime() + 30_000), ownerSessionHash, runId: created.streamRunId })
        ).resolves.toBeUndefined()

        expect(await repository.cleanupExpiredResults({ now: new Date(now.getTime() + 30_000) })).toBe(0)
        expect(await prisma!.imageGenerationRun.findUniqueOrThrow({ where: { streamRunId: created.streamRunId } })).toMatchObject({
            providerResultStatus: 'expired',
            providerResultUrl: null,
        })
    })
})
