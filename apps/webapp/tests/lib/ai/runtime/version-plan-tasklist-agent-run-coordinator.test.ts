import { AIMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resourceMocks = vi.hoisted(() => ({
    readDocsResource: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/adapters', () => ({
    projectDocsResourceAdapter: {
        read: resourceMocks.readDocsResource,
    },
}))

const chatMemoryMocks = vi.hoisted(() => ({
    appendCompletedTurn: vi.fn(),
    touchConversation: vi.fn(),
}))

vi.mock('@/lib/ai/runtime/chat-memory', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/runtime/chat-memory')>()

    return {
        ...actual,
        chatMemoryService: {
            ...actual.chatMemoryService,
            appendCompletedTurn: chatMemoryMocks.appendCompletedTurn,
        },
        conversationRegistryService: {
            ...actual.conversationRegistryService,
            touchConversation: chatMemoryMocks.touchConversation,
        },
    }
})

import type { AgentRunPublicDto } from '@/lib/ai/agent-runs/contracts'
import { buildChatConversationThreadId, buildChatMemoryThreadId, isChatMemoryThreadId } from '@/lib/ai/runtime/chat-memory'
import type { ChatSession } from '@/lib/ai/runtime/types'
import {
    createNoopTasklistLangSmithObserver,
    resumeVersionPlanTasklistAgentRun,
    startVersionPlanTasklistAgentRun,
    type TasklistLangSmithObserver,
} from '@/lib/ai/runtime/version-plan-tasklist-agent'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'demo://version-plans/v0.3.0-hitl-checkpoint-resume.md'
const chatMemoryEnv = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.3.0-hitl-checkpoint-resume.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const versionPlanContent = `
# v0.3.0 HITL Checkpoint Resume

## Summary

引入 Tasklist Agent HITL checkpoint resume。

## Goals

- Strategy 必审
- 修订前条件式 HITL
- durable checkpoint resume

## Non-goals

- 不做通用多 Agent 审批

## Test Plan

- 覆盖 initial / resume runner
`

const validTasklist = `
# v0.3.0 HITL Checkpoint Resume Tasklist

来源方案：${planUri}

## Summary

实现 Tasklist Agent HITL checkpoint resume MVP。

## Goals

- Strategy 必审
- 修订前条件式 HITL
- durable checkpoint resume

## Non-goals

- 不做通用多 Agent 审批

## 执行纪律

- 每完成一个 Step 后暂停，等待 review 和手动验证。

## Step 1：Runner

- [ ] 拆分 initial runner
- [ ] 拆分 resume runner
- [ ] 最小验证：执行 runner tests

## Step 2：Coordinator

- [ ] 接入 AgentRunService
- [ ] 持久化 interrupt
- [ ] 最小验证：执行 coordinator tests

## Test Plan

- [ ] 验证 Strategy Review pause
- [ ] 验证 resume final

## 工程验证

- [ ] pnpm typecheck

## Risks / 人工确认点

- 需要确认 checkpoint key 与 AgentRun threadId 一致。
`

const fixableWarningTasklist = validTasklist.replace(/## 执行纪律[\s\S]*?## Step 1/, '## Step 1')
const blockedTasklist = `
# Broken Tasklist

## Goals

- 缺少步骤、checklist 和验证内容。
`

const tasklistStrategy = {
    granularity: 'medium',
    grouping: 'by_phase',
    priorityFocus: ['core_runtime', 'state_model', 'tests'],
    stepCountRange: '5-8',
}

const proceedPlanningOutput = JSON.stringify({
    decision: {
        reason: '版本方案足够完整，可以继续生成 tasklist。',
        type: 'proceed_to_tasklist_strategy',
    },
    strategy: tasklistStrategy,
})

function createModel(...responses: string[]) {
    return {
        invoke: vi.fn().mockImplementation(async () => new AIMessage({ content: responses.shift() ?? validTasklist })),
    } as unknown as ChatSession['baseModel']
}

function createModels(...responses: string[]) {
    const model = createModel(...responses)

    return {
        model,
        models: {
            drafting: { model, timeoutMs: 300_000 },
            planning: { model, timeoutMs: 90_000 },
        },
    }
}

function createRuntimeConfig(checkpointMode: 'memory' | 'off' = 'memory') {
    return getTasklistAgentRuntimeConfig(
        {
            AI_MIND_GRAPH_CHECKPOINT: checkpointMode,
        },
        'development'
    )
}

function createFakeAgentRunService() {
    let currentRun: AgentRunPublicDto | undefined
    let currentInterrupt: AgentRunPublicDto['pendingInterrupt'] | undefined

    return {
        beginResume: vi.fn(async input => {
            if (!currentRun) {
                throw new Error('Run must be created before resume.')
            }
            if (!currentInterrupt) {
                throw new Error('Interrupt must be created before resume.')
            }

            const resumedInterrupt = {
                ...currentInterrupt,
                status: input.decision.type === 'reject' ? ('rejected' as const) : ('decided' as const),
            }
            currentInterrupt = resumedInterrupt

            return {
                conversationId: 'conversation-coordinator-test',
                decision: input.decision,
                interrupt: resumedInterrupt,
                run: {
                    ...currentRun,
                    status: 'resuming' as const,
                },
                threadId: currentInterrupt.threadId,
            }
        }),
        createPendingInterrupt: vi.fn(async input => {
            if (!currentRun) {
                throw new Error('Run must be created before interrupt.')
            }

            const pendingInterrupt: NonNullable<AgentRunPublicDto['pendingInterrupt']> = {
                allowedDecisions: Array.from(input.payload.allowedDecisions) as string[],
                interruptId: `interrupt-${input.payload.kind}-${Date.now()}-${Math.random()}`,
                interruptKind: input.payload.kind,
                nodeName: input.payload.nodeName,
                payload: input.payload,
                runId: input.runId,
                status: 'pending' as const,
                threadId: input.payload.threadId,
            }
            currentInterrupt = pendingInterrupt
            currentRun = {
                ...currentRun,
                pendingInterrupt,
                status: 'paused',
            }

            return pendingInterrupt
        }),
        createRun: vi.fn(async (_sessionId, input) => {
            currentRun = {
                agentType: input.agentType,
                agentVersion: 'v0.3.0',
                assistantMessageId: input.assistantMessageId,
                graphVersion: 'v0.3.0',
                runId: input.id ?? 'run-without-explicit-id',
                status: 'running',
            }

            return currentRun
        }),
        markCompleted: vi.fn(async (runId, resultStatus) => {
            currentRun = currentRun
                ? {
                      ...currentRun,
                      resultStatus,
                      runId,
                      status: 'completed',
                  }
                : currentRun
        }),
        markFailed: vi.fn(async (runId, failureCode, publicFailureMessage) => {
            currentRun = currentRun
                ? {
                      ...currentRun,
                      runId,
                      status: 'failed',
                  }
                : currentRun

            return {
                failureCode,
                publicFailureMessage,
            }
        }),
        markRejected: vi.fn(async runId => {
            currentRun = currentRun
                ? {
                      ...currentRun,
                      resultStatus: 'rejected',
                      runId,
                      status: 'rejected',
                  }
                : currentRun
        }),
    }
}

function mockResources() {
    resourceMocks.readDocsResource.mockResolvedValue({
        content: versionPlanContent,
        contentPreview: versionPlanContent,
        previewChars: 3000,
        resourceName: 'v0.3.0-hitl-checkpoint-resume.md',
        serverId: 'project-docs-server',
        truncated: false,
        uri: planUri,
    })
}

function createStartOptions(agentRunService: ReturnType<typeof createFakeAgentRunService>, ...responses: string[]) {
    const { model, models } = createModels(...responses)
    const writtenChunks: unknown[] = []

    return {
        model,
        options: {
            agentRunService,
            assistantMessageId: 'assistant-coordinator-test',
            context: {},
            langSmithObserver: createNoopTasklistLangSmithObserver(),
            conversationId: 'conversation-coordinator-test',
            modelId: 'ollama/qwen3-8b',
            modelProvider: 'ollama',
            models,
            reasoningEnabled: false,
            runtimeConfig: createRuntimeConfig(),
            sessionId: 'session-coordinator-test',
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            versionPlanReference,
            writeChunk: (chunk: unknown) => writtenChunks.push(chunk),
        },
        writtenChunks,
    }
}

function createFakeLangSmithObserver(): TasklistLangSmithObserver {
    return {
        observeHumanDecision: vi.fn(async () => {}),
        observeInitialRun: vi.fn(async () => {}),
        observeInterrupt: vi.fn(async () => {}),
        observeResult: vi.fn(async () => {}),
        observeResume: vi.fn(async () => {}),
    }
}

function createThrowingLangSmithObserver(): TasklistLangSmithObserver {
    return {
        async observeHumanDecision() {
            throw new Error('LangSmith unavailable')
        },
        async observeInitialRun() {
            throw new Error('LangSmith unavailable')
        },
        async observeInterrupt() {
            throw new Error('LangSmith unavailable')
        },
        async observeResult() {
            throw new Error('LangSmith unavailable')
        },
        async observeResume() {
            throw new Error('LangSmith unavailable')
        },
    }
}

function createResumeOptions(
    agentRunService: ReturnType<typeof createFakeAgentRunService>,
    runId: string,
    decision: unknown,
    ...responses: string[]
) {
    const { model, models } = createModels(...responses)
    const writtenChunks: unknown[] = []

    return {
        model,
        options: {
            agentRunService,
            context: {},
            decision,
            interruptId: 'interrupt-test',
            langSmithObserver: createNoopTasklistLangSmithObserver(),
            models,
            runId,
            runtimeConfig: createRuntimeConfig(),
            sessionId: 'session-coordinator-test',
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: (chunk: unknown) => writtenChunks.push(chunk),
        },
        writtenChunks,
    }
}

function getThreadMemoryStatusChunks(writtenChunks: unknown[]) {
    return writtenChunks.filter(
        (
            chunk
        ): chunk is {
            type: 'thread-memory-status'
            status: 'failed' | 'started' | 'succeeded'
            message: string
            summaryLength?: number
            pinnedDecisionCount?: number
        } => typeof chunk === 'object' && chunk !== null && 'type' in chunk && chunk.type === 'thread-memory-status'
    )
}

describe('runtime/version-plan-tasklist-agent run coordinator', () => {
    beforeEach(() => {
        resourceMocks.readDocsResource.mockReset()
        mockResources()
        chatMemoryMocks.appendCompletedTurn.mockReset()
        chatMemoryMocks.touchConversation.mockReset()
        chatMemoryMocks.touchConversation.mockResolvedValue(undefined)
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', chatMemoryEnv.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('initial run 创建 AgentRun，并在 Strategy Review 暂停时持久化 pending interrupt', async () => {
        const agentRunService = createFakeAgentRunService()
        const { options, writtenChunks } = createStartOptions(agentRunService, proceedPlanningOutput)
        const result = await startVersionPlanTasklistAgentRun(options)
        const createRunInput = agentRunService.createRun.mock.calls[0]?.[1]

        expect(result.graphResult.status).toBe('interrupted')
        expect(createRunInput).toMatchObject({
            agentType: 'version-plan-to-tasklist-agent',
            assistantMessageId: 'assistant-coordinator-test',
            conversationId: 'conversation-coordinator-test',
            modelId: 'ollama/qwen3-8b',
            reasoningEnabled: false,
            versionPlanUri: planUri,
        })
        expect(createRunInput.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(createRunInput.threadId).toBe(`tasklist-agent:conversation-coordinator-test:${createRunInput.id}`)
        expect(agentRunService.createPendingInterrupt).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    kind: 'strategy_review',
                    runId: createRunInput.id,
                    threadId: createRunInput.threadId,
                }),
                runId: createRunInput.id,
            })
        )
        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                assistantMessageId: 'assistant-coordinator-test',
                interruptKind: 'strategy_review',
                runId: createRunInput.id,
                threadId: createRunInput.threadId,
                type: 'agent-interrupt',
            })
        )
        expect(agentRunService.markCompleted).not.toHaveBeenCalled()
        expect(agentRunService.markRejected).not.toHaveBeenCalled()
        expect(agentRunService.markFailed).not.toHaveBeenCalled()
        expect(chatMemoryMocks.appendCompletedTurn).not.toHaveBeenCalled()
    })

    it('Tasklist resume 使用 tasklist-agent thread id，不接受 chat memory thread id 语义', async () => {
        const agentRunService = createFakeAgentRunService()
        const { options } = createStartOptions(agentRunService, proceedPlanningOutput)
        const result = await startVersionPlanTasklistAgentRun(options)
        const createRunInput = agentRunService.createRun.mock.calls[0]?.[1]
        const chatThreadId = buildChatMemoryThreadId('session-coordinator-test', {
            AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
        })

        expect(result.graphResult.status).toBe('interrupted')
        expect(createRunInput.threadId).toBe(`tasklist-agent:conversation-coordinator-test:${createRunInput.id}`)
        expect(isChatMemoryThreadId(chatThreadId)).toBe(true)
        expect(createRunInput.threadId).not.toBe(chatThreadId)
        expect(isChatMemoryThreadId(createRunInput.threadId)).toBe(false)
    })

    it('initial run 记录 LangSmith initial 与 interrupt metadata', async () => {
        const agentRunService = createFakeAgentRunService()
        const langSmithObserver = createFakeLangSmithObserver()
        const { options } = createStartOptions(agentRunService, proceedPlanningOutput)
        const result = await startVersionPlanTasklistAgentRun({
            ...options,
            langSmithObserver,
        })
        const createRunInput = agentRunService.createRun.mock.calls[0]?.[1]

        expect(result.graphResult.status).toBe('interrupted')
        expect(langSmithObserver.observeInitialRun).toHaveBeenCalledWith({
            agentType: 'version-plan-to-tasklist-agent',
            agentVersion: 'v0.3.0',
            assistantMessageId: 'assistant-coordinator-test',
            graphVersion: 'v0.3.0',
            modelId: 'ollama/qwen3-8b',
            provider: 'ollama',
            reasoningEnabled: false,
            runId: createRunInput.id,
            threadId: createRunInput.threadId,
            versionPlanUri: planUri,
        })
        expect(langSmithObserver.observeInterrupt).toHaveBeenCalledWith({
            assistantMessageId: 'assistant-coordinator-test',
            metadata: expect.objectContaining({
                interruptId: expect.any(String),
                interruptKind: 'strategy_review',
                reviewRound: 1,
                strategyRegenerations: 0,
            }),
            runId: createRunInput.id,
            threadId: createRunInput.threadId,
        })
    })

    it('resume 到 final 时把 AgentRun 标记为 completed', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const { options, model, writtenChunks } = createResumeOptions(agentRunService, runId, { type: 'approve' }, validTasklist)
        const resumed = await resumeVersionPlanTasklistAgentRun(options)

        expect(resumed.graphResult.status).toBe('completed')
        expect(agentRunService.beginResume).toHaveBeenCalledWith({
            decision: { type: 'approve' },
            interruptId: 'interrupt-test',
            runId,
            sessionId: 'session-coordinator-test',
        })
        expect(agentRunService.markCompleted).toHaveBeenCalledWith(runId, 'final')
        expect(agentRunService.markRejected).not.toHaveBeenCalled()
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(chatMemoryMocks.appendCompletedTurn).toHaveBeenCalledWith(
            buildChatConversationThreadId('session-coordinator-test', 'conversation-coordinator-test', chatMemoryEnv),
            expect.objectContaining({
                assistantMessageId: 'assistant-coordinator-test',
                completionStatus: 'final',
                source: 'tasklist-agent',
                userText: '基于这个版本方案生成 tasklist 草稿',
            }),
            expect.objectContaining({
                onStatus: expect.any(Function),
            })
        )
        expect(writtenChunks[0]).toMatchObject({
            assistantMessageId: 'assistant-coordinator-test',
            interruptId: expect.any(String),
            runId,
            type: 'agent-resume',
        })
    })

    it('Tasklist final-turn append 会把 chat-memory compaction status relay 到当前 stream', async () => {
        chatMemoryMocks.appendCompletedTurn.mockImplementationOnce(async (_threadId, _input, options) => {
            options?.onStatus?.({
                status: 'started',
                message: '自动压缩上下文中',
            })
            options?.onStatus?.({
                status: 'succeeded',
                message: '上下文已自动压缩',
                pinnedDecisionCount: 2,
                summaryLength: 128,
            })
        })
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const { options, writtenChunks } = createResumeOptions(agentRunService, runId, { type: 'approve' }, validTasklist)

        const resumed = await resumeVersionPlanTasklistAgentRun(options)

        expect(resumed.graphResult.status).toBe('completed')
        expect(getThreadMemoryStatusChunks(writtenChunks)).toEqual([
            {
                type: 'thread-memory-status',
                status: 'started',
                message: '自动压缩上下文中',
            },
            {
                type: 'thread-memory-status',
                status: 'succeeded',
                message: '上下文已自动压缩',
                pinnedDecisionCount: 2,
                summaryLength: 128,
            },
        ])
    })

    it('resume 记录 human decision、resume 与 final result metadata', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const langSmithObserver = createFakeLangSmithObserver()
        const { options } = createResumeOptions(agentRunService, runId, { type: 'approve' }, validTasklist)
        const resumed = await resumeVersionPlanTasklistAgentRun({
            ...options,
            langSmithObserver,
        })

        expect(resumed.graphResult.status).toBe('completed')
        expect(langSmithObserver.observeHumanDecision).toHaveBeenCalledWith({
            assistantMessageId: 'assistant-coordinator-test',
            metadata: {
                decisionType: 'approve',
                interruptId: expect.any(String),
                interruptKind: 'strategy_review',
            },
            runId,
            threadId: `tasklist-agent:conversation-coordinator-test:${runId}`,
        })
        expect(langSmithObserver.observeResume).toHaveBeenCalledWith({
            assistantMessageId: 'assistant-coordinator-test',
            metadata: {
                decisionType: 'approve',
                interruptId: expect.any(String),
                interruptKind: 'strategy_review',
            },
            runId,
            threadId: `tasklist-agent:conversation-coordinator-test:${runId}`,
        })
        expect(langSmithObserver.observeResult).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactGenerated: true,
                assistantMessageId: 'assistant-coordinator-test',
                resultStatus: 'final',
                runId,
                runStatus: 'completed',
                stage: 'resume',
                threadId: `tasklist-agent:conversation-coordinator-test:${runId}`,
            })
        )
    })

    it('resume 后遇到 revision HITL 时再次持久化 pending interrupt，下一次 resume 可完成 blocked', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const revisionPause = await resumeVersionPlanTasklistAgentRun(
            createResumeOptions(agentRunService, runId, { type: 'approve' }, fixableWarningTasklist).options
        )

        expect(revisionPause.graphResult.status).toBe('interrupted')
        expect(agentRunService.createPendingInterrupt).toHaveBeenCalledTimes(2)
        expect(agentRunService.createPendingInterrupt.mock.calls[1]?.[0]).toMatchObject({
            payload: expect.objectContaining({
                kind: 'tasklist_revision_review',
                nodeName: 'reviewTasklistRevision',
            }),
            runId,
        })

        const completed = await resumeVersionPlanTasklistAgentRun(
            createResumeOptions(agentRunService, runId, { type: 'approve' }, fixableWarningTasklist, blockedTasklist).options
        )

        expect(completed.graphResult.status).toBe('completed')
        expect(agentRunService.markCompleted).toHaveBeenCalledWith(runId, 'blocked')
        expect(chatMemoryMocks.appendCompletedTurn).toHaveBeenLastCalledWith(
            buildChatConversationThreadId('session-coordinator-test', 'conversation-coordinator-test', chatMemoryEnv),
            expect.objectContaining({
                completionStatus: 'blocked',
                source: 'tasklist-agent',
            }),
            expect.objectContaining({
                onStatus: expect.any(Function),
            })
        )
    })

    it('blocked result 记录 LangSmith result metadata 且不标记 artifactGenerated', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId

        await resumeVersionPlanTasklistAgentRun(
            createResumeOptions(agentRunService, runId, { type: 'approve' }, fixableWarningTasklist).options
        )

        const langSmithObserver = createFakeLangSmithObserver()
        const completed = await resumeVersionPlanTasklistAgentRun({
            ...createResumeOptions(agentRunService, runId, { type: 'approve' }, fixableWarningTasklist, blockedTasklist).options,
            langSmithObserver,
        })

        expect(completed.graphResult.status).toBe('completed')
        expect(langSmithObserver.observeHumanDecision).toHaveBeenCalledWith({
            assistantMessageId: 'assistant-coordinator-test',
            metadata: {
                decisionType: 'approve',
                interruptId: expect.any(String),
                interruptKind: 'tasklist_revision_review',
            },
            runId,
            threadId: `tasklist-agent:conversation-coordinator-test:${runId}`,
        })
        expect(langSmithObserver.observeResult).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactGenerated: false,
                resultStatus: 'blocked',
                runId,
                runStatus: 'completed',
                stage: 'resume',
            })
        )
    })

    it('HITL reject 时把 AgentRun 标记为 rejected', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const rejected = await resumeVersionPlanTasklistAgentRun(
            createResumeOptions(agentRunService, runId, { reason: '不接受当前策略。', type: 'reject' }).options
        )

        expect(rejected.graphResult.status).toBe('rejected')
        expect(agentRunService.markRejected).toHaveBeenCalledWith(runId)
        expect(agentRunService.markCompleted).not.toHaveBeenCalled()
    })

    it('HITL reject 记录 LangSmith rejected result metadata', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const langSmithObserver = createFakeLangSmithObserver()
        const rejected = await resumeVersionPlanTasklistAgentRun({
            ...createResumeOptions(agentRunService, runId, { reason: '不接受当前策略。', type: 'reject' }).options,
            langSmithObserver,
        })

        expect(rejected.graphResult.status).toBe('rejected')
        expect(langSmithObserver.observeHumanDecision).toHaveBeenCalledWith({
            assistantMessageId: 'assistant-coordinator-test',
            metadata: {
                decisionType: 'reject',
                interruptId: expect.any(String),
                interruptKind: 'strategy_review',
            },
            runId,
            threadId: `tasklist-agent:conversation-coordinator-test:${runId}`,
        })
        expect(langSmithObserver.observeResult).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactGenerated: false,
                resultStatus: 'rejected',
                runId,
                runStatus: 'rejected',
                stage: 'resume',
            })
        )
    })

    it('graph run 抛错时标记 AgentRun failed 并继续向上抛出错误', async () => {
        const agentRunService = createFakeAgentRunService()
        const { options } = createStartOptions(agentRunService, proceedPlanningOutput)

        await expect(
            startVersionPlanTasklistAgentRun({
                ...options,
                runtimeConfig: createRuntimeConfig('off'),
            })
        ).rejects.toThrow('No checkpointer set')

        const runId = agentRunService.createRun.mock.calls[0]?.[1].id

        expect(agentRunService.markFailed).toHaveBeenCalledWith(
            runId,
            'TASKLIST_AGENT_RUN_FAILED',
            expect.stringContaining('No checkpointer set')
        )
        expect(chatMemoryMocks.appendCompletedTurn).not.toHaveBeenCalled()
    })

    it('initial run failed 记录 LangSmith failed result metadata', async () => {
        const agentRunService = createFakeAgentRunService()
        const langSmithObserver = createFakeLangSmithObserver()
        const { options } = createStartOptions(agentRunService, proceedPlanningOutput)

        await expect(
            startVersionPlanTasklistAgentRun({
                ...options,
                langSmithObserver,
                runtimeConfig: createRuntimeConfig('off'),
            })
        ).rejects.toThrow('No checkpointer set')

        const runId = agentRunService.createRun.mock.calls[0]?.[1].id

        expect(langSmithObserver.observeResult).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactGenerated: false,
                assistantMessageId: 'assistant-coordinator-test',
                durationMs: expect.any(Number),
                failureCode: 'TASKLIST_AGENT_RUN_FAILED',
                failureMessage: expect.stringContaining('No checkpointer set'),
                runId,
                runStatus: 'failed',
                stage: 'initial',
                threadId: `tasklist-agent:conversation-coordinator-test:${runId}`,
            })
        )
    })

    it('resume 时 LangSmith observer failure soft fail，不影响 AgentRun status 和 stream', async () => {
        const agentRunService = createFakeAgentRunService()
        const started = await startVersionPlanTasklistAgentRun(createStartOptions(agentRunService, proceedPlanningOutput).options)
        const runId = started.run!.runId
        const { options, writtenChunks } = createResumeOptions(agentRunService, runId, { type: 'approve' }, validTasklist)
        const resumed = await resumeVersionPlanTasklistAgentRun({
            ...options,
            langSmithObserver: createThrowingLangSmithObserver(),
        })

        expect(resumed.graphResult.status).toBe('completed')
        expect(agentRunService.markCompleted).toHaveBeenCalledWith(runId, 'final')
        expect(agentRunService.markFailed).not.toHaveBeenCalled()
        expect(writtenChunks[0]).toMatchObject({
            assistantMessageId: 'assistant-coordinator-test',
            runId,
            type: 'agent-resume',
        })
    })
})
