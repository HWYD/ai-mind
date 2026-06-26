import { afterAll, describe, expect, it } from 'vitest'

import { getPrismaClient } from '../src'

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim())
const describeWithDatabase = hasDatabase ? describe : describe.skip
const prisma = hasDatabase ? getPrismaClient() : undefined

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
