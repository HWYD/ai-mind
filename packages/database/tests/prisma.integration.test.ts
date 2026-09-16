import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { getPrismaClient, prismaPoolConfig } from '../src'

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim())
const describeWithDatabase = hasDatabase ? describe : describe.skip
const prisma = hasDatabase ? getPrismaClient() : undefined

describe('@ai-mind/database process client lifecycle', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('固定每进程 pool max、connection timeout 和 idle timeout', () => {
        expect(prismaPoolConfig).toEqual({
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            max: 10,
        })
        expect(Object.isFrozen(prismaPoolConfig)).toBe(true)
    })

    it.each(['development', 'production'] as const)('%s 环境都复用同一个 Prisma/PrismaPg client', async nodeEnv => {
        const globalRuntime = globalThis as unknown as { aiMindPrisma?: ReturnType<typeof getPrismaClient> }
        const existingClient = globalRuntime.aiMindPrisma
        delete globalRuntime.aiMindPrisma
        vi.stubEnv('DATABASE_URL', process.env.DATABASE_URL?.trim() || 'postgresql://user:password@localhost:5432/ai_mind_test')
        vi.stubEnv('NODE_ENV', nodeEnv)

        const first = getPrismaClient()
        const second = getPrismaClient()

        try {
            expect(second === first).toBe(true)
        } finally {
            await first.$disconnect()
            if (second !== first) await second.$disconnect()
            delete globalRuntime.aiMindPrisma
            if (existingClient) globalRuntime.aiMindPrisma = existingClient
        }
    })
})

describeWithDatabase('@ai-mind/database Prisma PostgreSQL integration', () => {
    afterAll(async () => {
        await prisma!.$disconnect()
    })

    it('migration 创建业务表，但不创建 LangGraph checkpoint 表', async () => {
        const tables = await prisma!.$queryRaw<Array<{ table_name: string }>>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `
        const tableNames = tables.map(table => table.table_name)

        expect(tableNames).toContain('agent_runs')
        expect(tableNames).toContain('agent_interrupts')
        expect(tableNames).not.toContain('checkpoints')
        expect(tableNames).not.toContain('checkpoint_writes')
    })

    it('同一个 run 同时最多只有一个 pending interrupt', async () => {
        const unique = `${Date.now()}-${Math.random()}`
        const run = await prisma!.agentRun.create({
            data: {
                agentType: 'version-plan-to-tasklist-agent',
                agentVersion: 'v0.3.0',
                assistantMessageId: `assistant-${unique}`,
                conversationId: `conversation-${unique}`,
                graphVersion: 'v0.3.0',
                modelId: 'ollama/qwen3-8b',
                ownerSessionHash: 'a'.repeat(64),
                reasoningEnabled: false,
                status: 'running',
                threadId: `thread-${unique}`,
                userGoalSummary: '生成测试 tasklist',
                versionPlanUri: 'docs://versions/v0.3.0.md',
            },
        })

        try {
            const firstInterrupt = await prisma!.agentInterrupt.create({
                data: {
                    allowedDecisionsJson: ['approve', 'edit', 'reject', 'respond'],
                    interruptKind: 'strategy_review',
                    langgraphInterruptId: `langgraph-${unique}-1`,
                    nodeName: 'reviewTasklistStrategy',
                    payloadJson: { reviewRound: 1 },
                    runId: run.id,
                    sequence: 1,
                    status: 'pending',
                    threadId: run.threadId,
                },
            })

            await expect(
                prisma!.agentInterrupt.create({
                    data: {
                        allowedDecisionsJson: ['approve'],
                        interruptKind: 'tasklist_revision_review',
                        langgraphInterruptId: `langgraph-${unique}-2`,
                        nodeName: 'reviewTasklistRevision',
                        payloadJson: { reviewRound: 1 },
                        runId: run.id,
                        sequence: 2,
                        status: 'pending',
                        threadId: run.threadId,
                    },
                })
            ).rejects.toMatchObject({ code: 'P2002' })

            await prisma!.agentInterrupt.update({
                data: {
                    status: 'decided',
                },
                where: {
                    id: firstInterrupt.id,
                },
            })

            await expect(
                prisma!.agentInterrupt.create({
                    data: {
                        allowedDecisionsJson: ['approve'],
                        interruptKind: 'tasklist_revision_review',
                        langgraphInterruptId: `langgraph-${unique}-2`,
                        nodeName: 'reviewTasklistRevision',
                        payloadJson: { reviewRound: 1 },
                        runId: run.id,
                        sequence: 2,
                        status: 'pending',
                        threadId: run.threadId,
                    },
                })
            ).resolves.toMatchObject({
                runId: run.id,
                sequence: 2,
                status: 'pending',
            })
        } finally {
            await prisma!.agentRun.delete({
                where: {
                    id: run.id,
                },
            })
        }
    })
})
