import { getPrismaClient } from '@ai-mind/database'
import { afterEach, describe, expect, it } from 'vitest'

import { StreamRunService } from '@/lib/ai/stream-recovery/stream-run-service'

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim())
const describeWithDatabase = hasDatabase ? describe : describe.skip
const prisma = hasDatabase ? getPrismaClient() : undefined
const createdRunIds: string[] = []

function createOwnerSessionHash() {
    return crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64)
}

describeWithDatabase('stream recovery PostgreSQL integration', () => {
    afterEach(async () => {
        const runIds = createdRunIds.splice(0)

        if (runIds.length === 0) {
            return
        }

        await prisma!.streamRequest.deleteMany({
            where: {
                runId: {
                    in: runIds,
                },
            },
        })
        await prisma!.streamRun.deleteMany({
            where: {
                id: {
                    in: runIds,
                },
            },
        })
    })

    it('handles a real unique-key race with one created run and replay descriptors', async () => {
        const service = new StreamRunService()
        const ownerSessionHash = createOwnerSessionHash()
        const idempotencyKey = `postgres-race-${crypto.randomUUID()}`

        const results = await Promise.all(
            Array.from({ length: 3 }, () =>
                service.createOrReuseRun({
                    idempotencyKey,
                    kind: 'chat',
                    ownerSessionHash,
                    request: {
                        conversationId: 'postgres-race-conversation',
                        messages: [{ role: 'user', text: 'hello' }],
                    },
                })
            )
        )
        const runIds = [...new Set(results.map(result => result.request.runId))]
        createdRunIds.push(...runIds)

        expect(results.filter(result => result.type === 'created')).toHaveLength(1)
        expect(results.filter(result => result.type === 'replay')).toHaveLength(2)
        expect(runIds).toHaveLength(1)
        await expect(
            prisma!.streamRequest.count({
                where: {
                    idempotencyKey,
                    ownerSessionHash,
                },
            })
        ).resolves.toBe(1)
        await expect(
            prisma!.streamRun.count({
                where: {
                    id: runIds[0],
                },
            })
        ).resolves.toBe(1)
    })

    it('enforces the nullable one-to-one AgentRun relation in PostgreSQL', async () => {
        const ownerSessionHash = createOwnerSessionHash()
        const suffix = crypto.randomUUID()
        const agentRun = await prisma!.agentRun.create({
            data: {
                agentType: 'version-plan-to-tasklist-agent',
                agentVersion: 'v0.4.10',
                assistantMessageId: `assistant-${suffix}`,
                conversationId: `conversation-${suffix}`,
                graphVersion: 'v0.4.10',
                modelId: 'ollama/qwen3-8b',
                ownerSessionHash,
                reasoningEnabled: false,
                status: 'running',
                threadId: `thread-${suffix}`,
                userGoalSummary: 'verify StreamRun relation',
                versionPlanUri: 'demo://version-plans/v0.4.10.md',
            },
        })
        const firstRun = await prisma!.streamRun.create({
            data: {
                agentRunId: agentRun.id,
                kind: 'tasklist_agent',
                maxEventPayloadBytes: 262_144,
                maxRetainedEvents: 20_000,
                ownerSessionHash,
                retentionUntil: new Date(Date.now() + 10 * 60 * 1000),
                status: 'running',
            },
        })
        createdRunIds.push(firstRun.id)

        try {
            await expect(
                prisma!.streamRun.create({
                    data: {
                        agentRunId: agentRun.id,
                        kind: 'tasklist_agent',
                        maxEventPayloadBytes: 262_144,
                        maxRetainedEvents: 20_000,
                        ownerSessionHash,
                        retentionUntil: new Date(Date.now() + 10 * 60 * 1000),
                        status: 'running',
                    },
                })
            ).rejects.toMatchObject({ code: 'P2002' })

            await prisma!.agentRun.delete({ where: { id: agentRun.id } })
            await expect(prisma!.streamRun.findUnique({ where: { id: firstRun.id } })).resolves.toMatchObject({ agentRunId: null })
        } finally {
            await prisma!.agentRun.deleteMany({ where: { id: agentRun.id } })
        }
    })
})
