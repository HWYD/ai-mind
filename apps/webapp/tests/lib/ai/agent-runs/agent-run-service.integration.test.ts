import { getPrismaClient } from '@ai-mind/database'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentRunService, AgentRunServiceError } from '@/lib/ai/agent-runs'
import type { StrategyReviewInterruptPayload } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/hitl-review-schema'

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim())
const describeWithDatabase = hasDatabase ? describe : describe.skip
const serviceEnv = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'integration-secret-with-at-least-32-characters',
}
const sessionId = 'integration-session-owner'
const prisma = hasDatabase ? getPrismaClient() : undefined
const createdRunIds: string[] = []

function createService() {
    return new AgentRunService(undefined, serviceEnv)
}

async function createRun(service = createService(), suffix = `${Date.now()}-${Math.random()}`) {
    const threadId = `thread-${suffix}`
    const run = await service.createRun(sessionId, {
        agentType: 'version-plan-to-tasklist-agent',
        assistantMessageId: `assistant-${suffix}`,
        conversationId: `conversation-${suffix}`,
        modelId: 'ollama/qwen3-8b',
        reasoningEnabled: false,
        threadId,
        userGoalSummary: '  生成 v0.3.0 tasklist  ',
        versionPlanUri: 'demo://version-plans/v0.3.0.md',
    })
    createdRunIds.push(run.runId)

    return {
        run,
        service,
        threadId,
    }
}

function createStrategyInterruptPayload(runId: string, threadId: string): StrategyReviewInterruptPayload {
    return {
        allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
        data: {
            planUri: 'demo://version-plans/v0.3.0.md',
            reviewRound: 1,
            strategy: {
                granularity: 'medium',
                grouping: 'by_phase',
                priorityFocus: ['core_runtime', 'tests'],
                stepCountRange: '5-8',
            },
            targetVersion: 'v0.3.0',
        },
        kind: 'strategy_review',
        nodeName: 'reviewTasklistStrategy',
        runId,
        threadId,
    }
}

describeWithDatabase('lib/ai/agent-runs service integration', () => {
    afterEach(async () => {
        const runIds = createdRunIds.splice(0)

        if (runIds.length > 0) {
            await prisma!.agentRun.deleteMany({
                where: {
                    id: {
                        in: runIds,
                    },
                },
            })
        }
    })

    it('创建 run、暂停并只返回白名单 public DTO', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-strategy-1',
            payload: createStrategyInterruptPayload(run.runId, threadId),
            runId: run.runId,
        })
        const publicRun = await service.getOwnedRun(sessionId, run.runId)

        expect(run).toMatchObject({
            agentVersion: 'v0.3.0',
            graphVersion: 'v0.3.0',
            status: 'running',
        })
        expect(interrupt.status).toBe('pending')
        expect(publicRun).toMatchObject({
            pendingInterrupt: {
                interruptId: interrupt.interruptId,
                interruptKind: 'strategy_review',
                status: 'pending',
            },
            runId: run.runId,
            status: 'paused',
        })
        expect(publicRun).not.toHaveProperty('ownerSessionHash')
        expect(publicRun).not.toHaveProperty('modelId')
        expect(publicRun).not.toHaveProperty('failureMessage')

        const storedRun = await prisma!.agentRun.findUniqueOrThrow({
            where: {
                id: run.runId,
            },
        })
        expect(storedRun.ownerSessionHash).toMatch(/^[a-f0-9]{64}$/)
        expect(storedRun.ownerSessionHash).not.toContain(sessionId)
        expect(storedRun.userGoalSummary).toBe('生成 v0.3.0 tasklist')
    })

    it('非 owner session 无法读取或恢复 run', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-owner-1',
            payload: createStrategyInterruptPayload(run.runId, threadId),
            runId: run.runId,
        })

        await expect(service.getOwnedRun('another-session', run.runId)).rejects.toMatchObject({
            code: 'AGENT_RUN_FORBIDDEN',
        })
        await expect(
            service.beginResume({
                decision: { type: 'approve' },
                interruptId: interrupt.interruptId,
                runId: run.runId,
                sessionId: 'another-session',
            })
        ).rejects.toMatchObject({
            code: 'AGENT_RUN_FORBIDDEN',
        })
    })

    it('合法 decision 原子消费 interrupt 并把 run 更新为 resuming', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-resume-1',
            payload: createStrategyInterruptPayload(run.runId, threadId),
            runId: run.runId,
        })
        const result = await service.beginResume({
            decision: { type: 'approve' },
            interruptId: interrupt.interruptId,
            runId: run.runId,
            sessionId,
        })

        expect(result).toMatchObject({
            decision: { type: 'approve' },
            interrupt: {
                status: 'decided',
            },
            run: {
                status: 'resuming',
            },
            threadId,
        })

        await expect(service.markCompleted(run.runId, 'final')).resolves.toMatchObject({
            resultStatus: 'final',
            status: 'completed',
        })
        await expect(service.markCompleted(run.runId, 'final')).rejects.toMatchObject({
            code: 'AGENT_RESUME_FAILED',
        })
    })

    it('duplicate resume 并发请求只有一次成功', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-duplicate-1',
            payload: createStrategyInterruptPayload(run.runId, threadId),
            runId: run.runId,
        })
        const request = {
            decision: { type: 'approve' },
            interruptId: interrupt.interruptId,
            runId: run.runId,
            sessionId,
        }
        const results = await Promise.allSettled([service.beginResume(request), service.beginResume(request)])

        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
        expect(await prisma!.agentRun.findUnique({ where: { id: run.runId } })).toMatchObject({
            status: 'resuming',
        })
        expect(await prisma!.agentInterrupt.findUnique({ where: { id: interrupt.interruptId } })).toMatchObject({
            status: 'decided',
        })
    })

    it('reject decision 标记 interrupt rejected，并由受控终态迁移结束 run', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-reject-1',
            payload: createStrategyInterruptPayload(run.runId, threadId),
            runId: run.runId,
        })

        await expect(
            service.beginResume({
                decision: { reason: '策略不适合当前版本。', type: 'reject' },
                interruptId: interrupt.interruptId,
                runId: run.runId,
                sessionId,
            })
        ).resolves.toMatchObject({
            interrupt: {
                status: 'rejected',
            },
            run: {
                status: 'resuming',
            },
        })
        await expect(service.markRejected(run.runId)).resolves.toMatchObject({
            resultStatus: 'rejected',
            status: 'rejected',
        })
    })

    it('拒绝不在 allowedDecisions 中或不符合 kind schema 的 decision', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-invalid-decision-1',
            payload: {
                allowedDecisions: ['approve', 'edit', 'reject'],
                data: {
                    ...createStrategyInterruptPayload(run.runId, threadId).data,
                    reviewRound: 2,
                },
                kind: 'strategy_review',
                nodeName: 'reviewTasklistStrategy',
                runId: run.runId,
                threadId,
            },
            runId: run.runId,
        })

        await expect(
            service.beginResume({
                decision: { feedback: '再次生成', type: 'respond' },
                interruptId: interrupt.interruptId,
                runId: run.runId,
                sessionId,
            })
        ).rejects.toMatchObject({
            code: 'INVALID_AGENT_REVIEW_DECISION',
        })
    })

    it('version mismatch 会使 run 终止并 invalidated pending interrupt', async () => {
        const { run, service, threadId } = await createRun()
        const interrupt = await service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-version-1',
            payload: createStrategyInterruptPayload(run.runId, threadId),
            runId: run.runId,
        })

        await prisma!.agentRun.update({
            data: {
                graphVersion: 'v0.2.4',
            },
            where: {
                id: run.runId,
            },
        })

        await expect(
            service.beginResume({
                decision: { type: 'approve' },
                interruptId: interrupt.interruptId,
                runId: run.runId,
                sessionId,
            })
        ).rejects.toMatchObject({
            code: 'AGENT_RUN_VERSION_MISMATCH',
        })
        expect(await prisma!.agentRun.findUnique({ where: { id: run.runId } })).toMatchObject({
            status: 'version_mismatch',
        })
        expect(await prisma!.agentInterrupt.findUnique({ where: { id: interrupt.interruptId } })).toMatchObject({
            status: 'invalidated',
        })
    })

    it('run / interrupt 不匹配和 terminal run resume 均 fail closed', async () => {
        const first = await createRun(createService(), `first-${Date.now()}-${Math.random()}`)
        const second = await createRun(createService(), `second-${Date.now()}-${Math.random()}`)
        const firstInterrupt = await first.service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-mismatch-1',
            payload: createStrategyInterruptPayload(first.run.runId, first.threadId),
            runId: first.run.runId,
        })
        const secondInterrupt = await second.service.createPendingInterrupt({
            langgraphInterruptId: 'langgraph-mismatch-2',
            payload: createStrategyInterruptPayload(second.run.runId, second.threadId),
            runId: second.run.runId,
        })

        await expect(
            first.service.beginResume({
                decision: { type: 'approve' },
                interruptId: secondInterrupt.interruptId,
                runId: first.run.runId,
                sessionId,
            })
        ).rejects.toMatchObject({
            code: 'AGENT_INTERRUPT_NOT_PENDING',
        })

        await prisma!.agentRun.update({
            data: {
                completedAt: new Date(),
                resultStatus: 'final',
                status: 'completed',
            },
            where: {
                id: first.run.runId,
            },
        })

        await expect(
            first.service.beginResume({
                decision: { type: 'approve' },
                interruptId: firstInterrupt.interruptId,
                runId: first.run.runId,
                sessionId,
            })
        ).rejects.toMatchObject({
            code: 'AGENT_RUN_NOT_PAUSED',
        })
    })

    it('失败信息只接收受控公开文本，且不会进入 public DTO', async () => {
        const { run, service } = await createRun()
        const rawSecret = 'sk-raw-provider-secret'

        await service.markFailed(run.runId, 'MODEL_RUNTIME_FAILED', `模型运行失败：Bearer sensitive-token ${rawSecret}`)
        const storedRun = await prisma!.agentRun.findUniqueOrThrow({
            where: {
                id: run.runId,
            },
        })
        const publicRun = await service.getOwnedRun(sessionId, run.runId)

        expect(storedRun.failureMessage).toBe('模型运行失败：Bearer [REDACTED] [REDACTED]')
        expect(storedRun.failureMessage).not.toContain(rawSecret)
        expect(publicRun).not.toHaveProperty('failureCode')
        expect(publicRun).not.toHaveProperty('failureMessage')
    })

    it('service error 保持稳定业务错误码', () => {
        expect(new AgentRunServiceError('AGENT_RESUME_FAILED', 'resume failed')).toMatchObject({
            code: 'AGENT_RESUME_FAILED',
            message: 'resume failed',
            name: 'AgentRunServiceError',
        })
    })
})
