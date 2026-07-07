import { AgentRunService } from '@/lib/ai/agent-runs'
import type { AgentInterruptPublicDto, AgentRunPublicDto, AgentRunResultStatus } from '@/lib/ai/agent-runs/contracts'
import { createId } from '@/lib/ai/create-id'
import {
    buildChatConversationThreadId,
    chatMemoryService,
    conversationRegistryService,
    type ThreadMemoryStatusEvent,
} from '@/lib/ai/runtime/chat-memory'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

import type { ChatExecutionContext, WriteChunk } from '../types'
import type { TasklistAgentRuntimeConfig } from './config/agent-runtime-config'
import type { TasklistAgentInterruptPayload } from './contract/hitl-review-schema'
import { VERSION_PLAN_TASKLIST_AGENT_NAME } from './contract/types'
import { buildVersionPlanTasklistGraphThreadId } from './graph/graph-state'
import {
    resumeVersionPlanTasklistGraph,
    runInitialVersionPlanTasklistGraph,
    type RunVersionPlanTasklistGraphResult,
} from './graph/run-version-plan-tasklist-graph'
import type { TasklistAgentModelSet } from './model/tasklist-agent-model-set'
import {
    buildTasklistLangSmithHitlMetadata,
    buildTasklistLangSmithHitlMetadataFromInterruptPayload,
    createInitialTasklistLangSmithRunInput,
    createTasklistLangSmithObserver,
    extractTasklistLangSmithDecisionType,
    type TasklistLangSmithObserver,
} from './observability'
import { buildTasklistFinalAnswerTextSummary } from './stream/tasklist-agent-output'

export interface StartVersionPlanTasklistAgentRunOptions {
    assistantMessageId: string
    context: ChatExecutionContext
    conversationId: string
    models: TasklistAgentModelSet
    modelId: string
    modelProvider?: string
    reasoningEnabled: boolean
    runId?: string
    runtimeConfig: TasklistAgentRuntimeConfig
    sessionId: string
    userGoal: string
    versionPlanReference: ChatComposerReference
    writeChunk: WriteChunk
    agentRunService?: AgentRunCoordinatorService
    langSmithObserver?: TasklistLangSmithObserver
}

export interface ResumeVersionPlanTasklistAgentRunOptions {
    context: ChatExecutionContext
    decision: unknown
    interruptId: string
    models: TasklistAgentModelSet
    preparedResume?: PreparedVersionPlanTasklistAgentResume
    runId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    sessionId: string
    userGoal: string
    writeChunk: WriteChunk
    agentRunService?: AgentRunCoordinatorService
    langSmithObserver?: TasklistLangSmithObserver
}

export interface VersionPlanTasklistAgentRunCoordinatorResult {
    graphResult: RunVersionPlanTasklistGraphResult
    run?: AgentRunPublicDto
}

export interface PreparedVersionPlanTasklistAgentResume {
    conversationId: string
    decision: unknown
    interrupt: AgentInterruptPublicDto
    run: AgentRunPublicDto
    threadId: string
}

interface AgentRunCoordinatorService {
    beginResume(input: { decision: unknown; interruptId: string; runId: string; sessionId: string }): Promise<{
        conversationId: string
        decision: unknown
        interrupt: AgentInterruptPublicDto
        run: AgentRunPublicDto
        threadId: string
    }>
    createPendingInterrupt(input: {
        langgraphInterruptId: string
        payload: TasklistAgentInterruptPayload
        runId: string
    }): Promise<AgentInterruptPublicDto>
    createRun(
        sessionId: string,
        input: {
            agentType: string
            assistantMessageId: string
            conversationId: string
            id?: string
            modelId: string
            reasoningEnabled: boolean
            threadId: string
            userGoalSummary: string
            versionPlanUri: string
        }
    ): Promise<AgentRunPublicDto>
    markCompleted(runId: string, resultStatus: Exclude<AgentRunResultStatus, 'rejected'>): Promise<unknown>
    markFailed(runId: string, failureCode: string, publicFailureMessage: string): Promise<unknown>
    markRejected(runId: string): Promise<unknown>
}

async function observeTasklistLangSmith(action: () => Promise<void>) {
    try {
        await action()
    } catch {
        // LangSmith 只是外部观测层；observer 实现异常不得影响 AgentRun / checkpoint / stream 主流程。
    }
}

function writeThreadMemoryStatus(writeChunk: WriteChunk, event: ThreadMemoryStatusEvent) {
    writeChunk({
        type: 'thread-memory-status',
        status: event.status,
        message: event.message,
        ...(typeof event.summaryLength === 'number' ? { summaryLength: event.summaryLength } : {}),
        ...(typeof event.pinnedDecisionCount === 'number' ? { pinnedDecisionCount: event.pinnedDecisionCount } : {}),
    })
}

async function appendTasklistFinalTurn(options: {
    assistantMessageId: string
    conversationId: string
    graphResult: Extract<RunVersionPlanTasklistGraphResult, { status: 'completed' }>
    sessionId: string
    userGoal: string
    writeChunk: WriteChunk
}) {
    let assistantText: string

    try {
        assistantText = buildTasklistFinalAnswerTextSummary(options.graphResult.graphState)
    } catch {
        return
    }

    await chatMemoryService.appendCompletedTurn(
        buildChatConversationThreadId(options.sessionId, options.conversationId),
        {
            assistantMessageId: options.assistantMessageId,
            assistantText,
            completionStatus: options.graphResult.resultStatus === 'blocked' ? 'blocked' : 'final',
            source: 'tasklist-agent',
            userText: options.userGoal,
        },
        {
            onStatus: event => writeThreadMemoryStatus(options.writeChunk, event),
            promotionContext: {
                sessionId: options.sessionId,
                sourceConversationId: options.conversationId,
            },
        }
    )
    await conversationRegistryService.touchConversation(options.sessionId, options.conversationId, {
        hasMessages: true,
    })
}

async function persistGraphResult(options: {
    agentRunService: AgentRunCoordinatorService
    assistantMessageId: string
    durationMs: number
    graphResult: RunVersionPlanTasklistGraphResult
    langSmithObserver: TasklistLangSmithObserver
    runId: string
    sessionId: string
    stage: 'initial' | 'resume'
    userGoal: string
    writeChunk: WriteChunk
    conversationId: string
}) {
    const { agentRunService, graphResult, langSmithObserver, runId, writeChunk } = options

    switch (graphResult.status) {
        case 'interrupted': {
            const interrupt = await agentRunService.createPendingInterrupt({
                langgraphInterruptId: graphResult.interrupt.langgraphInterruptId,
                payload: graphResult.interrupt.payload,
                runId,
            })
            writeChunk({
                agentName: VERSION_PLAN_TASKLIST_AGENT_NAME,
                assistantMessageId: options.assistantMessageId,
                interruptId: interrupt.interruptId,
                interruptKind: interrupt.interruptKind,
                payload: interrupt.payload,
                runId,
                threadId: interrupt.threadId,
                type: 'agent-interrupt',
            })
            await observeTasklistLangSmith(() =>
                langSmithObserver.observeInterrupt({
                    assistantMessageId: options.assistantMessageId,
                    metadata: buildTasklistLangSmithHitlMetadataFromInterruptPayload({
                        interruptId: interrupt.interruptId,
                        payload: graphResult.interrupt.payload,
                    }),
                    runId,
                    threadId: interrupt.threadId,
                })
            )
            break
        }
        case 'completed':
            await agentRunService.markCompleted(runId, graphResult.resultStatus)
            await observeTasklistLangSmith(() =>
                langSmithObserver.observeResult({
                    artifactGenerated: graphResult.resultStatus !== 'blocked',
                    assistantMessageId: options.assistantMessageId,
                    durationMs: options.durationMs,
                    resultStatus: graphResult.resultStatus,
                    runId,
                    runStatus: 'completed',
                    stage: options.stage,
                    threadId: graphResult.graphState.threadId,
                })
            )
            try {
                await appendTasklistFinalTurn({
                    assistantMessageId: options.assistantMessageId,
                    conversationId: options.conversationId,
                    graphResult,
                    sessionId: options.sessionId,
                    userGoal: options.userGoal,
                    writeChunk: options.writeChunk,
                })
            } catch {
                // chat memory 是可降级能力，失败不影响 Tasklist Agent 已完成结果。
            }
            break
        case 'rejected':
            await agentRunService.markRejected(runId)
            await observeTasklistLangSmith(() =>
                langSmithObserver.observeResult({
                    artifactGenerated: false,
                    assistantMessageId: options.assistantMessageId,
                    durationMs: options.durationMs,
                    resultStatus: 'rejected',
                    runId,
                    runStatus: 'rejected',
                    stage: options.stage,
                    threadId: graphResult.graphState.threadId,
                })
            )
            break
        case 'failed':
            await agentRunService.markFailed(runId, graphResult.failureCode, graphResult.failureMessage)
            await observeTasklistLangSmith(() =>
                langSmithObserver.observeResult({
                    artifactGenerated: false,
                    assistantMessageId: options.assistantMessageId,
                    durationMs: options.durationMs,
                    failureCode: graphResult.failureCode,
                    failureMessage: graphResult.failureMessage,
                    runId,
                    runStatus: 'failed',
                    stage: options.stage,
                    threadId: graphResult.graphState.threadId,
                })
            )
            break
    }
}

export async function startVersionPlanTasklistAgentRun(
    options: StartVersionPlanTasklistAgentRunOptions
): Promise<VersionPlanTasklistAgentRunCoordinatorResult> {
    const agentRunService = options.agentRunService ?? new AgentRunService()
    const langSmithObserver = options.langSmithObserver ?? createTasklistLangSmithObserver()
    const runId = options.runId ?? createId()
    const threadId = buildVersionPlanTasklistGraphThreadId({
        conversationId: options.conversationId,
        runId,
    })
    const run = await agentRunService.createRun(options.sessionId, {
        agentType: VERSION_PLAN_TASKLIST_AGENT_NAME,
        assistantMessageId: options.assistantMessageId,
        conversationId: options.conversationId,
        id: runId,
        modelId: options.modelId,
        reasoningEnabled: options.reasoningEnabled,
        threadId,
        userGoalSummary: options.userGoal,
        versionPlanUri: options.versionPlanReference.uri,
    })
    await observeTasklistLangSmith(() =>
        langSmithObserver.observeInitialRun(
            createInitialTasklistLangSmithRunInput({
                assistantMessageId: options.assistantMessageId,
                modelId: options.modelId,
                provider: options.modelProvider,
                reasoningEnabled: options.reasoningEnabled,
                runId,
                threadId,
                versionPlanUri: options.versionPlanReference.uri,
            })
        )
    )
    const startedAt = Date.now()

    try {
        const graphResult = await runInitialVersionPlanTasklistGraph({
            assistantMessageId: options.assistantMessageId,
            context: options.context,
            conversationId: options.conversationId,
            models: options.models,
            runId,
            runtimeConfig: options.runtimeConfig,
            threadId,
            userGoal: options.userGoal,
            versionPlanReference: options.versionPlanReference,
            writeChunk: options.writeChunk,
        })

        await persistGraphResult({
            agentRunService,
            assistantMessageId: options.assistantMessageId,
            durationMs: Date.now() - startedAt,
            graphResult,
            langSmithObserver,
            runId,
            sessionId: options.sessionId,
            stage: 'initial',
            userGoal: options.userGoal,
            writeChunk: options.writeChunk,
            conversationId: options.conversationId,
        })

        return {
            graphResult,
            run,
        }
    } catch (error) {
        await agentRunService.markFailed(
            runId,
            'TASKLIST_AGENT_RUN_FAILED',
            error instanceof Error ? error.message : 'Tasklist Agent run failed.'
        )
        await observeTasklistLangSmith(() =>
            langSmithObserver.observeResult({
                artifactGenerated: false,
                assistantMessageId: options.assistantMessageId,
                durationMs: Date.now() - startedAt,
                failureCode: 'TASKLIST_AGENT_RUN_FAILED',
                failureMessage: error instanceof Error ? error.message : 'Tasklist Agent run failed.',
                runId,
                runStatus: 'failed',
                stage: 'initial',
                threadId,
            })
        )
        throw error
    }
}

export async function resumeVersionPlanTasklistAgentRun(
    options: ResumeVersionPlanTasklistAgentRunOptions
): Promise<VersionPlanTasklistAgentRunCoordinatorResult> {
    const agentRunService = options.agentRunService ?? new AgentRunService()
    const langSmithObserver = options.langSmithObserver ?? createTasklistLangSmithObserver()
    const resume =
        options.preparedResume ??
        (await agentRunService.beginResume({
            decision: options.decision,
            interruptId: options.interruptId,
            runId: options.runId,
            sessionId: options.sessionId,
        }))
    const decisionType = extractTasklistLangSmithDecisionType(resume.decision)
    const hitlMetadata = buildTasklistLangSmithHitlMetadata({
        decisionType,
        interruptId: resume.interrupt.interruptId,
        interruptKind: resume.interrupt.interruptKind,
    })
    const startedAt = Date.now()

    try {
        await observeTasklistLangSmith(() =>
            langSmithObserver.observeHumanDecision({
                assistantMessageId: resume.run.assistantMessageId,
                metadata: hitlMetadata,
                runId: options.runId,
                threadId: resume.threadId,
            })
        )
        options.writeChunk({
            agentName: VERSION_PLAN_TASKLIST_AGENT_NAME,
            assistantMessageId: resume.run.assistantMessageId,
            interruptId: resume.interrupt.interruptId,
            runId: options.runId,
            threadId: resume.threadId,
            type: 'agent-resume',
        })
        await observeTasklistLangSmith(() =>
            langSmithObserver.observeResume({
                assistantMessageId: resume.run.assistantMessageId,
                metadata: hitlMetadata,
                runId: options.runId,
                threadId: resume.threadId,
            })
        )

        const graphResult = await resumeVersionPlanTasklistGraph({
            context: options.context,
            decision: resume.decision,
            models: options.models,
            runId: options.runId,
            runtimeConfig: options.runtimeConfig,
            threadId: resume.threadId,
            userGoal: options.userGoal,
            writeChunk: options.writeChunk,
        })

        await persistGraphResult({
            agentRunService,
            assistantMessageId: resume.run.assistantMessageId,
            durationMs: Date.now() - startedAt,
            graphResult,
            langSmithObserver,
            runId: options.runId,
            sessionId: options.sessionId,
            stage: 'resume',
            userGoal: options.userGoal,
            writeChunk: options.writeChunk,
            conversationId: resume.conversationId,
        })

        return {
            graphResult,
            run: resume.run,
        }
    } catch (error) {
        await agentRunService.markFailed(
            options.runId,
            'TASKLIST_AGENT_RESUME_FAILED',
            error instanceof Error ? error.message : 'Tasklist Agent resume failed.'
        )
        await observeTasklistLangSmith(() =>
            langSmithObserver.observeResult({
                artifactGenerated: false,
                assistantMessageId: resume.run.assistantMessageId,
                durationMs: Date.now() - startedAt,
                failureCode: 'TASKLIST_AGENT_RESUME_FAILED',
                failureMessage: error instanceof Error ? error.message : 'Tasklist Agent resume failed.',
                runId: options.runId,
                runStatus: 'failed',
                stage: 'resume',
                threadId: resume.threadId,
            })
        )
        throw error
    }
}
