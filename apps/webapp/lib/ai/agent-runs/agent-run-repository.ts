import { type AgentInterrupt, type AgentRun, getPrismaClient, type Prisma, type PrismaClient } from '@ai-mind/database'

import type { AgentInterruptKind, AgentRunResultStatus, AgentRunStatus } from './contracts'

export interface CreateAgentRunRecordInput {
    agentType: string
    agentVersion: string
    assistantMessageId: string
    conversationId: string
    graphVersion: string
    id?: string
    modelId: string
    ownerSessionHash: string
    reasoningEnabled: boolean
    threadId: string
    userGoalSummary: string
    versionPlanUri: string
}

export interface CreatePendingAgentInterruptInput {
    allowedDecisions: string[]
    interruptKind: AgentInterruptKind
    langgraphInterruptId: string
    nodeName: string
    payload: unknown
    runId: string
    threadId: string
}

export interface BeginAgentRunResumeInput {
    agentVersion: string
    decision: unknown
    decisionType: string
    graphVersion: string
    interruptId: string
    ownerSessionHash: string
    runId: string
}

export type BeginAgentRunResumeFailure = 'forbidden' | 'interrupt_not_pending' | 'run_not_found' | 'run_not_paused' | 'version_mismatch'

export type BeginAgentRunResumeResult =
    | {
          interrupt: AgentInterrupt
          ok: true
          run: AgentRun
      }
    | {
          ok: false
          reason: BeginAgentRunResumeFailure
      }

export class AgentRunRepository {
    constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

    createRun(input: CreateAgentRunRecordInput) {
        return this.prisma.agentRun.create({
            data: {
                ...input,
                status: 'running',
            },
        })
    }

    getRunById(runId: string) {
        return this.prisma.agentRun.findUnique({
            where: {
                id: runId,
            },
        })
    }

    getInterruptById(interruptId: string) {
        return this.prisma.agentInterrupt.findUnique({
            where: {
                id: interruptId,
            },
        })
    }

    getPendingInterrupt(runId: string) {
        return this.prisma.agentInterrupt.findFirst({
            orderBy: {
                sequence: 'desc',
            },
            where: {
                runId,
                status: 'pending',
            },
        })
    }

    async createPendingInterrupt(input: CreatePendingAgentInterruptInput) {
        return this.prisma.$transaction(async transaction => {
            await transaction.$queryRaw`
                SELECT "id"
                FROM "agent_runs"
                WHERE "id" = CAST(${input.runId} AS UUID)
                FOR UPDATE
            `

            const run = await transaction.agentRun.findUnique({
                where: {
                    id: input.runId,
                },
            })

            if (!run || run.threadId !== input.threadId || (run.status !== 'running' && run.status !== 'resuming')) {
                throw new Error('AgentRun must be running or resuming before it can pause.')
            }

            const latestInterrupt = await transaction.agentInterrupt.findFirst({
                orderBy: {
                    sequence: 'desc',
                },
                select: {
                    sequence: true,
                },
                where: {
                    runId: input.runId,
                },
            })
            const interrupt = await transaction.agentInterrupt.create({
                data: {
                    allowedDecisionsJson: input.allowedDecisions as unknown as Prisma.InputJsonValue,
                    interruptKind: input.interruptKind,
                    langgraphInterruptId: input.langgraphInterruptId,
                    nodeName: input.nodeName,
                    payloadJson: input.payload as Prisma.InputJsonValue,
                    runId: input.runId,
                    sequence: (latestInterrupt?.sequence ?? 0) + 1,
                    status: 'pending',
                    threadId: input.threadId,
                },
            })

            await transaction.agentRun.update({
                data: {
                    pausedAt: new Date(),
                    status: 'paused',
                },
                where: {
                    id: input.runId,
                },
            })

            return interrupt
        })
    }

    async beginResume(input: BeginAgentRunResumeInput): Promise<BeginAgentRunResumeResult> {
        return this.prisma.$transaction(async transaction => {
            await transaction.$queryRaw`
                SELECT "id"
                FROM "agent_runs"
                WHERE "id" = CAST(${input.runId} AS UUID)
                FOR UPDATE
            `

            const run = await transaction.agentRun.findUnique({
                where: {
                    id: input.runId,
                },
            })

            if (!run) {
                return { ok: false, reason: 'run_not_found' }
            }

            if (run.ownerSessionHash !== input.ownerSessionHash) {
                return { ok: false, reason: 'forbidden' }
            }

            if (run.agentVersion !== input.agentVersion || run.graphVersion !== input.graphVersion) {
                await transaction.agentInterrupt.updateMany({
                    data: {
                        status: 'invalidated',
                    },
                    where: {
                        runId: input.runId,
                        status: 'pending',
                    },
                })
                await transaction.agentRun.update({
                    data: {
                        status: 'version_mismatch',
                    },
                    where: {
                        id: input.runId,
                    },
                })

                return { ok: false, reason: 'version_mismatch' }
            }

            if (run.status !== 'paused') {
                return { ok: false, reason: 'run_not_paused' }
            }

            const interrupt = await transaction.agentInterrupt.findFirst({
                where: {
                    id: input.interruptId,
                    runId: input.runId,
                },
            })

            if (!interrupt || interrupt.status !== 'pending') {
                return { ok: false, reason: 'interrupt_not_pending' }
            }

            const decidedAt = new Date()
            const consumedInterrupt = await transaction.agentInterrupt.updateMany({
                data: {
                    decidedAt,
                    decidedBy: 'session_owner',
                    decisionJson: input.decision as Prisma.InputJsonValue,
                    status: input.decisionType === 'reject' ? 'rejected' : 'decided',
                },
                where: {
                    id: input.interruptId,
                    runId: input.runId,
                    status: 'pending',
                },
            })

            if (consumedInterrupt.count !== 1) {
                return { ok: false, reason: 'interrupt_not_pending' }
            }

            const resumedRun = await transaction.agentRun.update({
                data: {
                    resumedAt: new Date(),
                    status: 'resuming',
                },
                where: {
                    id: input.runId,
                },
            })
            const resumedInterrupt = await transaction.agentInterrupt.findUniqueOrThrow({
                where: {
                    id: input.interruptId,
                },
            })

            return {
                interrupt: resumedInterrupt,
                ok: true,
                run: resumedRun,
            }
        })
    }

    async markVersionMismatch(
        runId: string,
        agentVersion: string,
        graphVersion: string
    ): Promise<'run_not_paused' | 'version_current' | 'version_mismatch'> {
        return this.prisma.$transaction(async transaction => {
            await transaction.$queryRaw`
                SELECT "id"
                FROM "agent_runs"
                WHERE "id" = CAST(${runId} AS UUID)
                FOR UPDATE
            `

            const run = await transaction.agentRun.findUniqueOrThrow({
                where: {
                    id: runId,
                },
            })

            if (run.agentVersion === agentVersion && run.graphVersion === graphVersion) {
                return 'version_current'
            }

            if (run.status !== 'paused') {
                return 'run_not_paused'
            }

            await transaction.agentInterrupt.updateMany({
                data: {
                    status: 'invalidated',
                },
                where: {
                    runId,
                    status: 'pending',
                },
            })

            await transaction.agentRun.update({
                data: {
                    status: 'version_mismatch',
                },
                where: {
                    id: runId,
                },
            })

            return 'version_mismatch'
        })
    }

    markPaused(runId: string) {
        return this.updateRunStatus(runId, ['running', 'resuming'], 'paused', {
            pausedAt: new Date(),
        })
    }

    markCompleted(runId: string, resultStatus: Exclude<AgentRunResultStatus, 'rejected'>) {
        return this.updateRunStatus(runId, ['running', 'resuming'], 'completed', {
            completedAt: new Date(),
            resultStatus,
        })
    }

    markRejected(runId: string) {
        return this.updateRunStatus(runId, ['resuming'], 'rejected', {
            resultStatus: 'rejected',
        })
    }

    markFailed(runId: string, failureCode: string, failureMessage: string) {
        return this.updateRunStatus(runId, ['running', 'paused', 'resuming'], 'failed', {
            failedAt: new Date(),
            failureCode,
            failureMessage,
        })
    }

    private async updateRunStatus(
        runId: string,
        allowedStatuses: AgentRunStatus[],
        status: AgentRunStatus,
        data: Prisma.AgentRunUpdateManyMutationInput
    ) {
        const updated = await this.prisma.agentRun.updateMany({
            data: {
                ...data,
                status,
            },
            where: {
                id: runId,
                status: {
                    in: allowedStatuses,
                },
            },
        })

        if (updated.count !== 1) {
            return undefined
        }

        return this.prisma.agentRun.findUniqueOrThrow({
            where: {
                id: runId,
            },
        })
    }
}
